import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { JOBS_DIR, LIBRARY_DIR } from "@/lib/video";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIME: Record<string, string> = {
  ".mp4": "video/mp4",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".mkv": "video/x-matroska",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
};

function resolveFile(jobId: string, name: string): string | null {
  if (!/^[a-zA-Z0-9-]+$/.test(jobId)) return null;
  const jobDir = path.join(JOBS_DIR, jobId);
  if (name === "clip.mp4") {
    const p = path.join(jobDir, "clip.mp4");
    return fs.existsSync(p) ? p : null;
  }
  if (name === "thumb.jpg") {
    const p = path.join(jobDir, "thumb.jpg");
    return fs.existsSync(p) ? p : null;
  }
  if (name === "original") {
    const hit = fs
      .readdirSync(LIBRARY_DIR)
      .filter((f) => f.startsWith(jobId))
      .map((f) => path.join(LIBRARY_DIR, f))
      .find((f) => fs.existsSync(f));
    return hit ?? null;
  }
  const m = name.match(/^frame-(\d{1,2})\.jpg$/);
  if (m) {
    const p = path.join(jobDir, "frames", `a_${String(Number(m[1])).padStart(2, "0")}.jpg`);
    return fs.existsSync(p) ? p : null;
  }
  return null;
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ jobId: string; name: string }> }
) {
  const { jobId, name } = await ctx.params;
  const file = resolveFile(jobId, name);
  if (!file) return new Response("غير موجود", { status: 404 });

  const stat = fs.statSync(file);
  const ext = path.extname(file).toLowerCase();
  const mime = MIME[ext] ?? "application/octet-stream";
  const range = req.headers.get("range");

  const headers: Record<string, string> = {
    "content-type": mime,
    "accept-ranges": "bytes",
    "cache-control": "no-store",
  };
  if (name === "clip.mp4") {
    headers["content-disposition"] = `attachment; filename="qassas-${jobId.slice(0, 8)}.mp4"`;
  }
  if (name === "original") {
    headers["content-disposition"] = `attachment; filename="original-${jobId.slice(0, 8)}${ext}"`;
  }

  if (range) {
    const m = range.match(/bytes=(\d*)-(\d*)/);
    if (m) {
      const start = m[1] ? parseInt(m[1], 10) : 0;
      const end = m[2] ? Math.min(parseInt(m[2], 10), stat.size - 1) : stat.size - 1;
      if (start >= stat.size || start > end) {
        return new Response(null, { status: 416 });
      }
      const stream = fs.createReadStream(file, { start, end });
      return new Response(Readable.toWeb(stream) as ReadableStream, {
        status: 206,
        headers: {
          ...headers,
          "content-range": `bytes ${start}-${end}/${stat.size}`,
          "content-length": String(end - start + 1),
        },
      });
    }
  }

  const stream = fs.createReadStream(file);
  return new Response(Readable.toWeb(stream) as ReadableStream, {
    status: 200,
    headers: { ...headers, "content-length": String(stat.size) },
  });
}
