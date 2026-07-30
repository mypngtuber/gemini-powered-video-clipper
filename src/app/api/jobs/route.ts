import { NextResponse } from "next/server";
import { db } from "@/db";
import { jobs } from "@/db/schema";
import { desc } from "drizzle-orm";
import { createJob } from "@/lib/runner";
import { getSettings, GEMINI_MODELS } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await db.select().from(jobs).orderBy(desc(jobs.createdAt)).limit(25);
  const s = await getSettings();
  return NextResponse.json({
    jobs: rows,
    models: GEMINI_MODELS,
    defaultModel: s.defaultModel,
  });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      url?: string;
      prompt?: string;
      aspectRatio?: string;
      model?: string;
    };
    const job = await createJob({
      url: body.url ?? "",
      prompt: body.prompt ?? "",
      aspectRatio: body.aspectRatio ?? "16:9",
      model: body.model,
    });
    return NextResponse.json({ ok: true, job });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "خطأ" },
      { status: 400 }
    );
  }
}
