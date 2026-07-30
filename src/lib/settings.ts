import { db } from "@/db";
import { settings } from "@/db/schema";
import { eq } from "drizzle-orm";

export const GEMINI_MODELS = [
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3-flash-preview",
  "gemini-3.1-flash-lite",
  "gemini-3.1-flash-lite-preview",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
] as const;

export const DEFAULT_MODEL = GEMINI_MODELS[0];

export async function getSettings() {
  const rows = await db.select().from(settings).where(eq(settings.id, "global"));
  if (rows.length > 0) return rows[0];
  await db
    .insert(settings)
    .values({ id: "global", defaultModel: DEFAULT_MODEL })
    .onConflictDoNothing();
  const created = await db
    .select()
    .from(settings)
    .where(eq(settings.id, "global"));
  return created[0];
}

export async function saveSettings(input: {
  geminiApiKey?: string | null;
  defaultModel?: string;
}) {
  await getSettings();
  await db
    .update(settings)
    .set({
      ...(input.geminiApiKey !== undefined && input.geminiApiKey !== null
        ? { geminiApiKey: input.geminiApiKey }
        : {}),
      ...(input.defaultModel ? { defaultModel: input.defaultModel } : {}),
      updatedAt: new Date(),
    })
    .where(eq(settings.id, "global"));
  return getSettings();
}

export async function getApiKey(): Promise<string> {
  const s = await getSettings();
  const key = s.geminiApiKey || process.env.GEMINI_API_KEY || "";
  return key.trim();
}

export function maskKey(key: string | null | undefined): string | null {
  if (!key) return null;
  if (key.length <= 8) return "••••••••";
  return `${key.slice(0, 4)}••••••••${key.slice(-4)}`;
}
