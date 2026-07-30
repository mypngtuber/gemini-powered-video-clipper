import { GoogleGenAI } from "@google/genai";

export interface FramePayload {
  t: number;
  base64: string;
}

export interface AnalysisResult {
  segments: {
    start: number;
    end: number;
    label: string;
    confidence: number;
    reason: string;
  }[];
  caption: string;
  mainSubject: string;
  hasMovingSubject: boolean;
}

export interface TrackPointRaw {
  i: number;
  x: number;
  y: number;
  visible?: boolean;
}

function extractText(res: unknown): string {
  const r = res as {
    text?: string;
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  if (typeof r?.text === "string" && r.text.trim()) return r.text;
  const parts = r?.candidates?.[0]?.content?.parts ?? [];
  return parts.map((p) => p.text ?? "").join("\n");
}

function safeJson<T>(raw: string): T {
  let s = raw.trim();
  s = s.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(s) as T;
  } catch {
    const start = s.search(/[{[]/);
    const isArr = s[start] === "[";
    const end = isArr ? s.lastIndexOf("]") : s.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      return JSON.parse(s.slice(start, end + 1)) as T;
    }
    throw new Error("تعذر قراءة استجابة Gemini");
  }
}

function cleanB64(b64: string): string {
  return b64.replace(/\s+/g, "");
}

async function generate(model: string, apiKey: string, parts: unknown[]): Promise<string> {
  const ai = new GoogleGenAI({ apiKey });
  const res = await ai.models.generateContent({
    model,
    contents: [{ role: "user", parts: parts as never }],
    config: {
      responseMimeType: "application/json",
      temperature: 0.2,
    },
  });
  const text = extractText(res);
  if (!text.trim()) throw new Error("استجابة فارغة من Gemini");
  return text;
}

const AR_FRAME_LIST = (frames: FramePayload[]) =>
  frames.map((f, i) => `#${i} → ${f.t.toFixed(1)}s`).join(" | ");

export async function analyzeVideo(opts: {
  apiKey: string;
  model: string;
  prompt: string;
  durationSec: number;
  frames: FramePayload[];
  audioBase64?: string | null;
}): Promise<AnalysisResult> {
  const { apiKey, model, prompt, durationSec, frames, audioBase64 } = opts;
  const instruction = `
أنت محلل فيديو خبير يعمل فى استوديو مونتاج. سأعطيك لقطات (فريمات) من فيديو مرتبة زمنيًا، وقد أرفق المسار الصوتي كاملًا.

خريطة الفريمات (رقم الصورة → الثانية داخل الفيديو):
${AR_FRAME_LIST(frames)}

مدة الفيديو الكلية: ${durationSec.toFixed(1)} ثانية.

طلب المستخدم بالضبط: "${prompt}"

المطلوب منك:
1. حلّل الفريمات بصريًا + الصوت (الكلام/الموسيقى/الأحداث الصوتية) لتحديد المقطع الزمني الذي يطابق طلب المستخدم بدقة.
2. حدد بداية ونهاية المقطع بالثواني (float). اجعل البداية قبل اللحظة المطلوبة بفاصل طبيعي بسيط (~0.3-1s) والنهاية بعد اكتمالها فورًا. لا تتجاوز حدود [0, ${durationSec.toFixed(1)}].
3. حدد "العنصر المتحرك الأهم" فى هذا المقطع إن وجد (مثال: كرة قدم، لاعب، وجه شخص، سيارة، حيوان). اكتب mainSubject بالإنجليزية كوصف قصير (مثال: "the soccer ball", "the player in red")، أو "" لو الفيديو ثابت/حواري بدون عنصر متحرك واضح.
4. hasMovingSubject = true فقط لو يوجد عنصر متحرك واضح يستحق التتبع.
5. caption: وصف عربي سينمائي قصير جدًا للقطعة المختارة.
6. segments: أفضل 1-3 مقاطع مطابقة مرتبة حسب الجودة.

أرجع JSON فقط بهذا الشكل بدون أي نص إضافي:
{"segments":[{"start":0.0,"end":0.0,"label":"","confidence":0.0,"reason":""}],"caption":"","mainSubject":"","hasMovingSubject":false}`;

  const parts: unknown[] = [{ text: instruction }];
  for (const f of frames) {
    parts.push({
      inlineData: { mimeType: "image/jpeg", data: cleanB64(f.base64) },
    });
  }
  if (audioBase64) {
    parts.push({ text: "المسار الصوتي الكامل للفيديو:" });
    parts.push({
      inlineData: { mimeType: "audio/mp3", data: cleanB64(audioBase64) },
    });
  }

  const raw = await generate(model, apiKey, parts);
  const parsed = safeJson<AnalysisResult>(raw);
  if (!parsed.segments || parsed.segments.length === 0) {
    throw new Error("لم يجد Gemini مقطعًا مطابقًا للوصف");
  }
  return parsed;
}

export async function trackSubject(opts: {
  apiKey: string;
  model: string;
  subject: string;
  frames: FramePayload[];
}): Promise<TrackPointRaw[]> {
  const { apiKey, model, subject, frames } = opts;
  const instruction = `
You will receive ${frames.length} frames from a video, in chronological order (index #0 to #${frames.length - 1}).

Task: locate the SUBJECT: "${subject}" in every frame, for smart vertical (9:16) reframing.

For each frame return the NORMALIZED center of the subject: x (0=left edge, 1=right edge), y (0=top, 1=bottom).
- If the subject is occluded/out of frame in some frame, set "visible": false and give your best spatial estimate.
- The array MUST contain exactly ${frames.length} objects, one per frame, IN ORDER, with "i" equal to the frame index.

Return ONLY JSON in this exact shape:
{"points":[{"i":0,"x":0.5,"y":0.5,"visible":true}]}`;

  const parts: unknown[] = [{ text: instruction }];
  for (const f of frames) {
    parts.push({
      inlineData: { mimeType: "image/jpeg", data: cleanB64(f.base64) },
    });
  }
  const raw = await generate(model, apiKey, parts);
  const parsed = safeJson<{ points: TrackPointRaw[] }>(raw);
  if (!parsed.points || !Array.isArray(parsed.points) || parsed.points.length === 0) {
    throw new Error("تعذر تتبع العنصر");
  }
  return parsed.points;
}
