import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline as streamPipeline } from "node:stream/promises";
import ffmpegPath from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";

export const PROJECT_ROOT = process.cwd();
export const CACHE_DIR = path.join(PROJECT_ROOT, "cache");
export const JOBS_DIR = path.join(CACHE_DIR, "jobs");
export const LIBRARY_DIR = path.join(CACHE_DIR, "library");

const YTDLP_LOCAL = path.join(PROJECT_ROOT, "tools", "yt-dlp");
const FFMPEG: string = (ffmpegPath as unknown as string) || "ffmpeg";
const FFPROBE: string = ffprobeStatic.path || "ffprobe";
const YTDLP: string = fs.existsSync(YTDLP_LOCAL) ? YTDLP_LOCAL : "yt-dlp";

export function ensureDirs() {
  for (const d of [CACHE_DIR, JOBS_DIR, LIBRARY_DIR]) {
    fs.mkdirSync(d, { recursive: true });
  }
}

export interface RunHandle {
  promise: Promise<string>;
  child: ChildProcess;
}

export function run(
  cmd: string,
  args: string[],
  opts: {
    onStdout?: (line: string) => void;
    signal?: AbortSignal;
  } = {}
): RunHandle {
  const child = spawn(cmd, args, {
    stdio: ["ignore", "pipe", "pipe"],
    signal: opts.signal,
  });
  let stderrTail = "";
  let stdoutTail = "";
  let lineBuf = "";
  child.stdout?.on("data", (d: Buffer) => {
    const s = d.toString();
    stdoutTail = (stdoutTail + s).slice(-4000);
    if (opts.onStdout) {
      lineBuf += s;
      let idx: number;
      while ((idx = lineBuf.indexOf("\n")) !== -1) {
        const line = lineBuf.slice(0, idx);
        lineBuf = lineBuf.slice(idx + 1);
        opts.onStdout(line);
      }
    }
  });
  child.stderr?.on("data", (d: Buffer) => {
    stderrTail = (stderrTail + d.toString()).slice(-4000);
  });
  const promise = new Promise<string>((resolve, reject) => {
    child.on("error", (err) => {
      if ((err as NodeJS.ErrnoException).code === "ABORT_ERR") {
        reject(new Error("ABORTED"));
      } else {
        reject(new Error(`تعذر تشغيل ${path.basename(cmd)}: ${err.message}`));
      }
    });
    child.on("close", (code) => {
      if (code === 0) resolve(stdoutTail);
      else if (opts.signal?.aborted) reject(new Error("ABORTED"));
      else {
        const tail = stderrTail.trim().split("\n").slice(-3).join(" | ");
        reject(new Error(tail || `${path.basename(cmd)} exited ${code}`));
      }
    });
  });
  return { promise, child };
}

async function runSimple(cmd: string, args: string[]): Promise<string> {
  const { promise } = run(cmd, args);
  return promise;
}

/* ---------------------------------- probe ---------------------------------- */

export interface ProbeResult {
  durationSec: number;
  width: number;
  height: number;
  title: string | null;
}

export async function probe(file: string): Promise<ProbeResult> {
  const out = await runSimple(FFPROBE, [
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    file,
  ]);
  const json = JSON.parse(out);
  const v = (json.streams || []).find(
    (s: { codec_type?: string }) => s.codec_type === "video"
  );
  const durationSec = Math.max(
    0,
    parseFloat(json.format?.duration ?? "0") || 0
  );
  return {
    durationSec,
    width: v?.width ?? 0,
    height: v?.height ?? 0,
    title: json.format?.tags?.title ?? null,
  };
}

/* --------------------------------- download --------------------------------- */

export async function downloadVideo(
  url: string,
  outDir: string,
  onProgress: (ratio: number) => void,
  signal?: AbortSignal
): Promise<string> {
  const template = path.join(outDir, "source.%(ext)s");
  // Clean previous attempts
  for (const f of fs.readdirSync(outDir)) {
    if (f.startsWith("source.")) fs.rmSync(path.join(outDir, f), { force: true });
  }

  const args = [
    "--no-playlist",
    "--no-warnings",
    "--newline",
    "--no-color",
    "--socket-timeout",
    "30",
    "-f",
    "bv*[height<=1080][ext=mp4]+ba[ext=m4a]/bv*[height<=1080]+ba/b[height<=1080]/b",
    "--merge-output-format",
    "mp4",
    "--ffmpeg-location",
    path.dirname(FFMPEG),
    "-o",
    template,
    url,
  ];

  try {
    const { promise } = run(YTDLP, args, {
      signal,
      onStdout: (line) => {
        const m = line.match(/\[download\]\s+([\d.]+)%/);
        if (m) onProgress(Math.min(1, parseFloat(m[1]) / 100));
      },
    });
    await promise;
  } catch (err) {
    if (signal?.aborted) throw new Error("ABORTED");
    // Fallback: direct file download (works for direct mp4 links)
    await directDownload(url, path.join(outDir, "source.mp4"), onProgress, signal);
  }

  const file = fs
    .readdirSync(outDir)
    .filter((f) => f.startsWith("source."))
    .sort((a, b) => {
      const sa = fs.statSync(path.join(outDir, a)).size;
      const sb = fs.statSync(path.join(outDir, b)).size;
      return sb - sa;
    })
    .find((f) => /\.(mp4|mov|mkv|webm|m4v)$/i.test(f));
  if (!file) throw new Error("تعذر تحميل الفيديو من هذا الرابط");
  return path.join(outDir, file);
}

async function directDownload(
  url: string,
  dest: string,
  onProgress: (ratio: number) => void,
  signal?: AbortSignal
) {
  const res = await fetch(url, {
    redirect: "follow",
    signal,
    headers: { "user-agent": "Mozilla/5.0 (Qassas)" },
  });
  if (!res.ok || !res.body)
    throw new Error(`تعذر تحميل الرابط (HTTP ${res.status})`);
  const total = Number(res.headers.get("content-length") || 0);
  let received = 0;
  const nodeStream = Readable.fromWeb(
    res.body as unknown as import("stream/web").ReadableStream
  );
  nodeStream.on("data", (chunk: Buffer) => {
    received += chunk.length;
    if (total > 0) onProgress(Math.min(1, received / total));
  });
  await streamPipeline(nodeStream, fs.createWriteStream(dest));
  onProgress(1);
}

/* ------------------------------ frame/audio ------------------------------ */

export async function extractFrames(
  src: string,
  outDir: string,
  label: string,
  times: number[],
  width = 832
): Promise<{ t: number; file: string }[]> {
  fs.mkdirSync(outDir, { recursive: true });
  const out: { t: number; file: string }[] = [];
  for (let i = 0; i < times.length; i++) {
    const dest = path.join(outDir, `${label}_${String(i).padStart(2, "0")}.jpg`);
    await runSimple(FFMPEG, [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-ss",
      String(Math.max(0, times[i])),
      "-i",
      src,
      "-frames:v",
      "1",
      "-vf",
      `scale=${width}:-2`,
      "-q:v",
      "4",
      dest,
    ]);
    if (fs.existsSync(dest)) out.push({ t: times[i], file: dest });
  }
  return out;
}

export async function extractAudio(
  src: string,
  dest: string,
  maxSec = 480
): Promise<string | null> {
  try {
    await runSimple(FFMPEG, [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      src,
      "-t",
      String(maxSec),
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-b:a",
      "24k",
      dest,
    ]);
    return fs.existsSync(dest) && fs.statSync(dest).size > 1000 ? dest : null;
  } catch {
    return null;
  }
}

/* --------------------------------- cutting --------------------------------- */

function even(n: number): number {
  return Math.max(2, Math.floor(n / 2) * 2);
}

export interface TrackPoint {
  t: number; // seconds relative to segment start
  x: number; // normalized 0..1
  y: number; // normalized 0..1
}

/**
 * Builds a full-frame 9:16 filter. When tracking points exist, the crop
 * window pans smoothly toward the tracked subject (piecewise steps over a
 * dense + smoothed grid read as continuous motion).
 */
export function buildShortFilter(
  srcW: number,
  srcH: number,
  durationSec: number,
  points: TrackPoint[] | null
): string {
  const A = 9 / 16;
  let cw: number;
  let ch: number;
  let xExpr: string;
  let yExpr: string;

  // Dense time grid (0.25s) → interpolate tracked points → moving-average smooth
  const smooth = (get: (p: TrackPoint) => number, size: number): number[] => {
    const gridN = Math.max(2, Math.ceil(durationSec / 0.25) + 1);
    const raw: number[] = [];
    const pts = (points ?? []).slice().sort((a, b) => a.t - b.t);
    for (let i = 0; i < gridN; i++) {
      const t = Math.min(durationSec, i * 0.25);
      let v: number;
      if (pts.length === 0) v = 0.5;
      else if (t <= pts[0].t) v = get(pts[0]);
      else if (t >= pts[pts.length - 1].t) v = get(pts[pts.length - 1]);
      else {
        let j = 0;
        while (j < pts.length - 2 && pts[j + 1].t < t) j++;
        const p0 = pts[j];
        const p1 = pts[j + 1];
        const f = p1.t > p0.t ? (t - p0.t) / (p1.t - p0.t) : 0;
        v = get(p0) + (get(p1) - get(p0)) * f;
      }
      raw.push(v);
    }
    const out: number[] = [];
    for (let i = 0; i < raw.length; i++) {
      let acc = 0;
      let n = 0;
      for (let k = -3; k <= 3; k++) {
        const j = i + k;
        if (j >= 0 && j < raw.length) {
          acc += raw[j];
          n++;
        }
      }
      out.push(acc / n);
    }
    return out.length > 80
      ? out.filter((_, i) => i % Math.ceil(out.length / 80) === 0 || i === out.length - 1)
      : out;
  };

  const exprFor = (values: number[], px: (v: number) => number): string => {
    const n = values.length;
    if (n === 0 || !points || points.length === 0) return "";
    const step = durationSec / (n - 1);
    const parts: string[] = [];
    for (let i = 0; i < n; i++) {
      const t0 = i * step;
      const t1 = (i + 1) * step;
      const val = even(px(values[i]));
      if (i === 0) parts.push(`${val}*(t<${t1.toFixed(2)})`);
      else if (i === n - 1) parts.push(`${val}*(t>=${t0.toFixed(2)})`);
      else
        parts.push(
          `${val}*(t>=${t0.toFixed(2)})*(t<${t1.toFixed(2)})`
        );
    }
    return parts.join("+");
  };

  const tracked = !!points && points.length >= 2;

  if (srcW / srcH > A) {
    // Landscape → pan horizontally
    ch = even(srcH);
    cw = even(ch * A);
    if (tracked) {
      const xs = smooth((p) => p.x, points!.length);
      xExpr = exprFor(xs, (v) =>
        Math.min(srcW - cw, Math.max(0, v * srcW - cw / 2))
      );
    } else {
      xExpr = `(iw-${cw})/2`;
    }
    yExpr = `(ih-${ch})/2`;
  } else {
    // Portrait/square → crop vertically, pan up/down
    cw = even(srcW);
    ch = even(cw / A);
    if (tracked) {
      const ys = smooth((p) => p.y, points!.length);
      yExpr = exprFor(ys, (v) =>
        Math.min(srcH - ch, Math.max(0, v * srcH - ch / 2))
      );
    } else {
      yExpr = `(ih-${ch})/2`;
    }
    xExpr = `(iw-${cw})/2`;
  }

  if (!xExpr || !yExpr) {
    // Degenerate fallback: centered crop
    xExpr = `(iw-${cw})/2`;
    yExpr = `(ih-${ch})/2`;
  }
  return `crop=${cw}:${ch}:${xExpr}:${yExpr},scale=1080:1920:flags=lanczos,setsar=1`;
}

export async function cutClip(
  src: string,
  dst: string,
  opts: {
    startSec: number;
    durationSec: number;
    filter?: string;
    onProgress?: (ratio: number) => void;
    signal?: AbortSignal;
  }
): Promise<void> {
  const { startSec, durationSec, filter, onProgress, signal } = opts;
  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-progress",
    "pipe:1",
    "-nostats",
    "-ss",
    startSec.toFixed(3),
    "-i",
    src,
    "-t",
    durationSec.toFixed(3),
  ];
  if (filter) args.push("-vf", filter);
  args.push(
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    "19",
    "-pix_fmt",
    "yuv420p",
    "-profile:v",
    "high",
    "-level",
    "4.1",
    "-c:a",
    "aac",
    "-b:a",
    "160k",
    "-movflags",
    "+faststart",
    dst
  );
  const { promise } = run(FFMPEG, args, {
    signal,
    onStdout: (line) => {
      const m = line.match(/^out_time_us=(\d+)/) ?? line.match(/^out_time_ms=(\d+)/);
      if (m && onProgress && durationSec > 0) {
        const us = Number(m[1]);
        onProgress(Math.min(1, us / (durationSec * 1_000_000)));
      }
    },
  });
  await promise;
  if (!fs.existsSync(dst) || fs.statSync(dst).size < 1024) {
    throw new Error("فشل تصدير المقطع");
  }
}

export async function makeThumb(clip: string, dest: string, sec = 0.3) {
  try {
    await runSimple(FFMPEG, [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-ss",
      String(sec),
      "-i",
      clip,
      "-frames:v",
      "1",
      "-vf",
      "scale=640:-2",
      "-q:v",
      "4",
      dest,
    ]);
  } catch {
    /* ignore */
  }
}

export const paths = { FFMPEG, FFPROBE, YTDLP };
