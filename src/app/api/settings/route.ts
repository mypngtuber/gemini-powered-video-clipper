import { NextResponse } from "next/server";
import { getSettings, saveSettings, maskKey, getApiKey } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const s = await getSettings();
  const envKey = process.env.GEMINI_API_KEY?.trim();
  return NextResponse.json({
    defaultModel: s.defaultModel,
    hasKey: Boolean(s.geminiApiKey || envKey),
    keyPreview: maskKey(s.geminiApiKey || envKey || null),
    keySource: s.geminiApiKey ? "settings" : envKey ? "env" : null,
  });
}

export async function PUT(req: Request) {
  try {
    const body = (await req.json()) as {
      geminiApiKey?: string;
      defaultModel?: string;
    };
    await saveSettings({
      geminiApiKey:
        typeof body.geminiApiKey === "string" && body.geminiApiKey.trim()
          ? body.geminiApiKey.trim()
          : undefined,
      defaultModel: body.defaultModel,
    });
    const s = await getSettings();
    return NextResponse.json({
      ok: true,
      defaultModel: s.defaultModel,
      keyPreview: maskKey(s.geminiApiKey || (await getApiKey())),
      hasKey: true,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "خطأ" },
      { status: 400 }
    );
  }
}
