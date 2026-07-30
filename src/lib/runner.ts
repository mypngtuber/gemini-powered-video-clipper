import { db } from "@/db";
import { jobs, type JobRow } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  ensureDirs,
  JOBS_DIR,
  LIBRARY_DIR,
  downloadVideo,
  probe,
  extractFrames,
  extractAudio,
  buildShortFilter,
  cutClip,
  makeThumb,
  type TrackPoint,
} from "./video";
import { analyzeVideo, trackSubject } from "./gemini";
import { getApiKey, getSettings, GEMINI_MODELS } from "./settings";

const MAX_DURATION_SEC = 15 * 60;
const MAX_CLIP_SEC = 180;
const MIN_CLIP_SEC = 1.5;

export const TERMINAL = new Set(["done", "error"]);

interface QueueState {
  running: boolean;
  pending: string[];
  controllers: Map<string, AbortController>;
}

const g = globalThis as typeof globalThis & { __qassasQueue?: QueueState };
function queue(): QueueState {
  if (!g.__qassasQueue) {
    g.__qassasQueue = { running: false, pending: [], controllers: new Map() };
  }
  return g.__qassasQueue;
}

let bootstrapped = (globalThis as { __qassasBoot?: boolean }).__qassasBoot;
async function bootstrapOnce() {
  if (bootstrapped) return;
  bootstrapped = true;
  (globalThis as { __qassasBoot?: boolean }).__qassasBoot = true;
  ensureDirs();
  // Mark jobs interrupted by a server restart as failed
  await db
    .update(jobs)
    .set({
      status: "error",
      error: "توقف المعالج أثناء التنفيذ — أعد إنشاء المهمة",
      step: "خطأ",
      updatedAt: new Date(),
    })
    .where(
      inArray(jobs.status, [
        "queued",
        "downloading",
        "extracting",
        "analyzing",
        "tracking",
        "cutting",
      ])
    )
    .catch(() => {});
}

async function update(id: string, patch: Partial<typeof jobs.$inferInsert>) {
  await db
    .update(jobs)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(jobs.id, id));
}

function jobDir(id: string) {
  return path.join(JOBS_DIR, id);
}

function findSource(id: string): string | null {
  const dir = jobDir(id);
  if (!fs.existsSync(dir)) return null;
  const f = fs
    .readdirSync(dir)
    .filter((x) => x.startsWith("source."))
    .map((x) => path.join(dir, x))
    .find((x) => fs.existsSync(x));
  return f ?? null;
}

/* ------------------------------ public API ------------------------------ */

export async function createJob(input: {
  url: string;
  prompt: string;
  aspectRatio: string;
  model?: string;
}): Promise<JobRow> {
  await bootstrapOnce();
  const url = input.url.trim();
  if (!/^https?:\/\/.+/i.test(url)) {
    throw new Error("الرابط غير صالح — يجب أن يبدأ بـ http/https");
  }
  const prompt = input.prompt.trim();
  if (prompt.length < 3) throw new Error("اكتب وصف اللقطة المطلوبة");
  const aspectRatio = input.aspectRatio === "9:16" ? "9:16" : "16:9";
  const s = await getSettings();
  const model = GEMINI_MODELS.includes(input.model as never)
    ? (input.model as string)
    : s.defaultModel || (GEMINI_MODELS[0] as string);

  const id = randomUUID();
  fs.mkdirSync(jobDir(id), { recursive: true });
  const inserted = await db
    .insert(jobs)
    .values({ id, url, prompt, aspectRatio, model })
    .returning();
  queue().pending.push(id);
  void pump();
  return inserted[0];
}

export function cancelJob(id: string) {
  queue().controllers.get(id)?.abort();
}

export async function keepOriginal(id: string): Promise<{ ok: boolean; message: string }> {
  const src = findSource(id);
  if (!src) {
    return { ok: false, message: "تم حذف ملف الكاش بالفعل بعد انتهاء المعالجة" };
  }
  const dest = path.join(LIBRARY_DIR, `${id}${path.extname(src)}`);
  fs.copyFileSync(src, dest);
  await update(id, { keepOriginal: true, hasOriginal: true });
  return { ok: true, message: "تم حفظ النسخة الأصلية في المكتبة" };
}

export function originalPath(id: string): string | null {
  const hit = fs
    .readdirSync(LIBRARY_DIR)
    .filter((f) => f.startsWith(id))
    .map((f) => path.join(LIBRARY_DIR, f))
    .find((f) => fs.existsSync(f));
  return hit ?? null;
}

export async function deleteJob(id: string) {
  cancelJob(id);
  fs.rmSync(jobDir(id), { recursive: true, force: true });
  const lib = originalPath(id);
  if (lib) fs.rmSync(lib, { force: true });
  await db.delete(jobs).where(eq(jobs.id, id));
}

/* -------------------------------- pipeline ------------------------------- */

async function pump() {
  const q = queue();
  if (q.running) return;
  q.running = true;
  try {
    while (q.pending.length > 0) {
      const id = q.pending.shift()!;
      const controller = new AbortController();
      q.controllers.set(id, controller);
      try {
        await pipeline(id, controller.signal);
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message === "ABORTED"
              ? "تم إلغاء المهمة"
              : err.message
            : "خطأ غير متوقع";
        await update(id, {
          status: "error",
          error: msg,
          step: "خطأ",
          progress: 0,
        }).catch(() => {});
        cleanupTemp(id, true).catch(() => {});
      } finally {
        q.controllers.delete(id);
      }
    }
  } finally {
    q.running = false;
  }
}

async function cleanupTemp(id: string, force: boolean) {
  const [job] = await db.select().from(jobs).where(eq(jobs.id, id));
  if (!job) return;
  if (!force && job.keepOriginal) return;
  // Remove downloaded source, frames and audio — keep only the exported clip
  const dir = jobDir(id);
  const src = findSource(id);
  if (src) fs.rmSync(src, { force: true });
  fs.rmSync(path.join(dir, "frames"), { recursive: true, force: true });
  fs.rmSync(path.join(dir, "audio.mp3"), { force: true });
  fs.rmSync(path.join(dir, "track"), { recursive: true, force: true });
  await update(id, { sourceCleaned: true, hasOriginal: !!originalPath(id) });
}

async function pipeline(id: string, signal: AbortSignal) {
  const [job] = await db.select().from(jobs).where(eq(jobs.id, id));
  if (!job) return;
  const dir = jobDir(id);
  fs.mkdirSync(dir, { recursive: true });

  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error("مفتاح Gemini API غير موجود — أضفه من زر الإعدادات أولًا");
  }

  /* 1) download */
  await update(id, { status: "downloading", step: "تحميل الفيديو ككاش مؤقت", progress: 2 });
  const source = await downloadVideo(
    job.url,
    dir,
    (r) => void update(id, { progress: Math.round(2 + r * 36) }).catch(() => {}),
    signal
  );
  const meta = await probe(source);
  if (!meta.durationSec || meta.durationSec < 1) {
    throw new Error("تعذر قراءة الفيديو المحمّل");
  }
  if (meta.durationSec > MAX_DURATION_SEC) {
    throw new Error("الفيديو أطول من 15 دقيقة — استخدم فيديو أقصر");
  }
  await update(id, {
    title: meta.title,
    durationMs: Math.round(meta.durationSec * 1000),
    width: meta.width,
    height: meta.height,
    progress: 40,
  });

  /* 2) extract frames + audio */
  await update(id, { status: "extracting", step: "استخراج الفريمات والصوت", progress: 42 });
  const frameCount = Math.min(16, Math.max(8, Math.round(meta.durationSec / 8)));
  const pad = Math.min(1.5, meta.durationSec * 0.05);
  const times = Array.from({ length: frameCount }, (_, i) =>
    Math.min(
      meta.durationSec - 0.1,
      pad + (i * (meta.durationSec - pad * 2)) / Math.max(1, frameCount - 1)
    )
  );
  const frames = await extractFrames(source, path.join(dir, "frames"), "a", times);
  if (frames.length < 3) throw new Error("تعذر استخراج الفريمات من الفيديو");
  const audioPath = await extractAudio(source, path.join(dir, "audio.mp3"));
  await update(id, { framesCount: frames.length, progress: 50 });

  /* 3) Gemini analysis */
  await update(id, {
    status: "analyzing",
    step: `تحليل الفيديو عبر ${job.model} (صور + صوت)`,
    progress: 54,
  });
  const framePayloads = frames.map((f) => ({
    t: f.t,
    base64: fs.readFileSync(f.file).toString("base64"),
  }));
  const audioBase64 = audioPath
    ? fs.readFileSync(audioPath).toString("base64")
    : null;
  const analysis = await analyzeVideo({
    apiKey,
    model: job.model,
    prompt: job.prompt,
    durationSec: meta.durationSec,
    frames: framePayloads,
    audioBase64,
  });
  let start = Math.max(0, Math.min(analysis.segments[0].start, meta.durationSec - MIN_CLIP_SEC));
  let end = Math.min(meta.durationSec, Math.max(analysis.segments[0].end, start + MIN_CLIP_SEC));
  if (end - start > MAX_CLIP_SEC) end = start + MAX_CLIP_SEC;
  await update(id, {
    analysis: analysis as never,
    caption: analysis.caption || null,
    mainSubject: analysis.mainSubject || null,
    segmentStartMs: Math.round(start * 1000),
    segmentEndMs: Math.round(end * 1000),
    progress: 66,
  });

  /* 4) tracking (shorts only, when a moving subject exists) */
  let trackPoints: TrackPoint[] | null = null;
  if (job.aspectRatio === "9:16" && analysis.hasMovingSubject && analysis.mainSubject) {
    await update(id, {
      status: "tracking",
      step: `تتبع العنصر المتحرك: ${analysis.mainSubject}`,
      progress: 70,
    });
    try {
      const segDur = end - start;
      const n = Math.min(26, Math.max(8, Math.round(segDur / 0.7)));
      const tt = Array.from({ length: n }, (_, i) =>
        Math.min(end - 0.05, start + (i * segDur) / Math.max(1, n - 1))
      );
      const tFrames = await extractFrames(source, path.join(dir, "track"), "t", tt, 640);
      const raw = await trackSubject({
        apiKey,
        model: job.model,
        subject: analysis.mainSubject,
        frames: tFrames.map((f) => ({
          t: f.t - start,
          base64: fs.readFileSync(f.file).toString("base64"),
        })),
      });
      // align by index when possible
      trackPoints = tFrames
        .map((f, i) => {
          const p = raw.find((r) => r.i === i) ?? raw[Math.min(i, raw.length - 1)];
          if (!p) return null;
          return {
            t: Math.max(0, f.t - start),
            x: Math.min(1, Math.max(0, Number(p.x))),
            y: Math.min(1, Math.max(0, Number(p.y))),
          };
        })
        .filter((p): p is TrackPoint => !!p);
      if (trackPoints.length < 2) trackPoints = null;
    } catch {
      trackPoints = null; // graceful fallback to centered crop
    }
  }

  /* 5) cut & export H.264 */
  await update(id, { status: "cutting", step: "قص وتصدير H.264 (متوافق مع Premiere Pro)", progress: 76 });
  const duration = end - start;
  const filter =
    job.aspectRatio === "9:16"
      ? buildShortFilter(meta.width, meta.height, duration, trackPoints)
      : undefined;
  const clip = path.join(dir, "clip.mp4");
  await cutClip(source, clip, {
    startSec: start,
    durationSec: duration,
    filter,
    signal,
    onProgress: (r) =>
      void update(id, { progress: Math.round(76 + r * 21) }).catch(() => {}),
  });
  await makeThumb(clip, path.join(dir, "thumb.jpg"), Math.min(0.5, duration / 2));

  if (job.keepOriginal) {
    await keepOriginal(id);
  }

  await update(id, {
    status: "done",
    step: "اكتمل بنجاح",
    progress: 100,
    hasClip: true,
    hasOriginal: !!originalPath(id),
  });

  /* 6) cache cleanup — original is deleted unless user saved it */
  await cleanupTemp(id, false);
}
