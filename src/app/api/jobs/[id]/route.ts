import { NextResponse } from "next/server";
import { db } from "@/db";
import { jobs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { cancelJob, deleteJob, keepOriginal } from "@/lib/runner";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const [job] = await db.select().from(jobs).where(eq(jobs.id, id));
  if (!job) return NextResponse.json({ error: "غير موجود" }, { status: 404 });
  return NextResponse.json({ job });
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const body = (await req.json()) as { action?: string };
  if (body.action === "keepOriginal") {
    const res = await keepOriginal(id);
    return NextResponse.json(res, { status: res.ok ? 200 : 409 });
  }
  if (body.action === "cancel") {
    cancelJob(id);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "إجراء غير معروف" }, { status: 400 });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  await deleteJob(id);
  return NextResponse.json({ ok: true });
}
