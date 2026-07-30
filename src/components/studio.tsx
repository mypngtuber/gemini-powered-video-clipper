"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Clapperboard,
  KeyRound,
  Link2,
  Loader2,
  MonitorPlay,
  Scissors,
  Smartphone,
  Sparkles,
  Wand2,
} from "lucide-react";
import { BackgroundFX } from "./fx";
import { JobList, type Job } from "./job-card";
import { SettingsDialog, type SettingsInfo } from "./settings-dialog";

const DEFAULT_MODELS = [
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3-flash-preview",
  "gemini-3.1-flash-lite",
  "gemini-3.1-flash-lite-preview",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
];

const EXAMPLES = [
  "لحظة الهدف والاحتفال مباشرة بعده",
  "أهم 10 ثواني من حديث الضيف",
  "الانفجار ولقطة رد الفعل",
  "القطة وهي تحاول القفز وتقع",
];

export function Studio() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [models, setModels] = useState<string[]>(DEFAULT_MODELS);
  const [url, setUrl] = useState("");
  const [prompt, setPrompt] = useState("");
  const [aspect, setAspect] = useState<"16:9" | "9:16">("16:9");
  const [model, setModel] = useState(DEFAULT_MODELS[0]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsInfo, setSettingsInfo] = useState<SettingsInfo | null>(null);
  const [keepBusyId, setKeepBusyId] = useState<string | null>(null);
  const jobsRef = useRef<Job[]>([]);
  jobsRef.current = jobs;

  const refreshJobs = useCallback(async () => {
    try {
      const res = await fetch("/api/jobs", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setJobs(data.jobs ?? []);
      if (data.models?.length) setModels(data.models);
      if (data.defaultModel) {
        setModel((m) => (m === DEFAULT_MODELS[0] ? data.defaultModel : m));
      }
    } catch {
      /* keep polling silently */
    }
  }, []);

  const refreshSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/settings", { cache: "no-store" });
      if (!res.ok) return;
      setSettingsInfo(await res.json());
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void refreshJobs();
    void refreshSettings();
  }, [refreshJobs, refreshSettings]);

  // Poll while any job is active
  useEffect(() => {
    const anyActive = jobs.some((j) => !["done", "error"].includes(j.status));
    if (!anyActive) return;
    const t = setInterval(() => void refreshJobs(), 1400);
    return () => clearInterval(t);
  }, [jobs, refreshJobs]);

  const submit = async () => {
    setFormError(null);
    if (!url.trim()) return setFormError("ضع رابط الفيديو أولًا");
    if (!/^https?:\/\//i.test(url.trim())) return setFormError("الرابط يجب أن يبدأ بـ http أو https");
    if (prompt.trim().length < 3) return setFormError("اكتب وصف اللقطة المطلوبة");
    setSubmitting(true);
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: url.trim(), prompt: prompt.trim(), aspectRatio: aspect, model }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "تعذر إنشاء المهمة");
      setJobs((prev) => [data.job, ...prev]);
      setPrompt("");
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "خطأ");
    } finally {
      setSubmitting(false);
    }
  };

  const act = async (id: string, action: () => Promise<Response>, onDone?: (data: unknown) => void) => {
    try {
      const res = await action();
      const data = await res.json().catch(() => ({}));
      onDone?.(data);
      await refreshJobs();
      return data;
    } catch {
      await refreshJobs();
      return null;
    }
  };

  const onCancel = (id: string) =>
    void act(id, () =>
      fetch(`/api/jobs/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      })
    );

  const onDelete = (id: string) =>
    void act(id, () => fetch(`/api/jobs/${id}`, { method: "DELETE" }));

  const onKeepOriginal = async (id: string) => {
    setKeepBusyId(id);
    const data = await act(id, () =>
      fetch(`/api/jobs/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "keepOriginal" }),
      })
    ) as { message?: string } | null;
    setKeepBusyId(null);
    if (data?.message) setFormError(null);
  };

  const activeCount = jobs.filter((j) => !["done", "error"].includes(j.status)).length;

  return (
    <div className="grain relative min-h-screen">
      <BackgroundFX />

      {/* nav */}
      <header className="relative z-10 mx-auto flex w-full max-w-4xl items-center justify-between px-5 pt-7">
        <div className="flex items-center gap-3">
          <span className="relative flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-cyan-600 shadow-[0_10px_30px_-8px_rgba(124,58,237,0.7)] ring-1 ring-white/20">
            <Clapperboard size={20} className="text-white" />
          </span>
          <div className="leading-tight">
            <p className="text-base font-black tracking-tight text-snow">قصّاص</p>
            <p className="font-mono text-[10px] tracking-[0.25em] text-mist" dir="ltr">
              QASSAS · AI
            </p>
          </div>
        </div>

        <button
          onClick={() => setSettingsOpen(true)}
          className="btn-ghost flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-fog"
        >
          <KeyRound size={14} className={settingsInfo?.hasKey ? "text-emerald-300" : "text-amber-300"} />
          <span className={`h-1.5 w-1.5 rounded-full ${settingsInfo?.hasKey ? "bg-emerald-400" : "bg-amber-400"}`} />
          {settingsInfo?.hasKey ? "مفتاح API جاهز" : "أضف مفتاح API"}
        </button>
      </header>

      {/* hero */}
      <section className="relative z-10 mx-auto w-full max-w-4xl px-5 pt-14 pb-10 text-center sm:pt-20">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-violet-400/25 bg-violet-500/10 px-4 py-1.5 text-[11px] font-bold text-violet-200"
        >
          <Sparkles size={13} className="text-cyan-300" />
          تحليل بصري + صوتي عبر Gemini Vision & Audio
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.08 }}
          className="text-4xl font-black leading-[1.25] tracking-tight text-snow sm:text-6xl sm:leading-[1.2]"
        >
          قُصّ اللقطة اللي <span className="glow-text">في بالك</span>
          <br />
          من أي فيديو على الإنترنت
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.16 }}
          className="mx-auto mt-5 max-w-xl text-sm leading-relaxed text-fog sm:text-base"
        >
          الصق الرابط، صِف اللقطة بكلماتك، ودع Gemini يحدّد التوقيت بدقة من الفريمات
          والصوت — ثم يُصدَّر المقطع H.264 جاهزًا لـ Premiere Pro، بعرض 16:9 أو
          شورت 9:16 مع تتبع ذكي للعنصر المتحرك.
        </motion.p>
      </section>

      {/* composer */}
      <motion.section
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.24 }}
        className="relative z-10 mx-auto w-full max-w-4xl px-5"
      >
        <div className="glass rounded-[2rem] p-6 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.8)] sm:p-8">
          {/* url */}
          <label className="mb-2 flex items-center gap-2 text-xs font-bold text-fog">
            <Link2 size={13} className="text-cyan-300" />
            رابط الفيديو
          </label>
          <input
            dir="ltr"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void submit()}
            placeholder="https://youtube.com/watch?v=... أو أي رابط مباشر mp4"
            className="field text-left"
            spellCheck={false}
          />

          {/* prompt */}
          <label className="mt-6 mb-2 flex items-center gap-2 text-xs font-bold text-fog">
            <Wand2 size={13} className="text-violet-300" />
            صِف اللقطة اللي عايزها بالظبط
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={2}
            placeholder="مثال: اللقطة اللي اللاعب بيسدد فيها الكورة من خارج المنطقة وتدخل الجول…"
            className="field resize-none leading-relaxed"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                onClick={() => setPrompt(ex)}
                className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] text-fog transition hover:border-violet-400/40 hover:bg-violet-500/10 hover:text-violet-100"
              >
                {ex}
              </button>
            ))}
          </div>

          {/* controls */}
          <div className="mt-7 grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
            {/* aspect segmented */}
            <div className="flex rounded-2xl border border-white/10 bg-black/40 p-1">
              {(
                [
                  { v: "16:9", icon: MonitorPlay, label: "فيديو 16:9" },
                  { v: "9:16", icon: Smartphone, label: "شورت 9:16" },
                ] as const
              ).map((o) => (
                <button
                  key={o.v}
                  onClick={() => setAspect(o.v)}
                  className={`relative flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition sm:flex-none ${
                    aspect === o.v ? "text-white" : "text-mist hover:text-fog"
                  }`}
                >
                  {aspect === o.v && (
                    <motion.span
                      layoutId="aspect-pill"
                      className="absolute inset-0 rounded-xl bg-gradient-to-l from-violet-600 to-cyan-700 shadow-[0_6px_20px_-6px_rgba(124,58,237,0.6)]"
                      transition={{ type: "spring", stiffness: 300, damping: 28 }}
                    />
                  )}
                  <span className="relative flex items-center gap-2">
                    <o.icon size={14} />
                    {o.label}
                  </span>
                </button>
              ))}
            </div>

            {/* model select */}
            <select
              dir="ltr"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="field py-3 text-left text-sm"
              title="موديل Gemini"
            >
              {models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>

            {/* submit */}
            <button
              onClick={() => void submit()}
              disabled={submitting}
              className="btn-primary flex items-center justify-center gap-2.5 px-8 py-3.5 text-sm font-black text-white"
            >
              {submitting ? (
                <Loader2 size={17} className="animate-spin" />
              ) : (
                <Scissors size={17} />
              )}
              {submitting ? "جار الإنشاء…" : "اِقصِ الآن"}
            </button>
          </div>

          {formError && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 rounded-xl border border-rose-400/25 bg-rose-500/10 px-4 py-2.5 text-xs font-semibold text-rose-200"
            >
              {formError}
            </motion.p>
          )}

          {aspect === "9:16" && (
            <motion.p
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="mt-4 flex items-center gap-2 rounded-xl border border-cyan-400/20 bg-cyan-400/5 px-4 py-2.5 text-[11px] leading-relaxed text-cyan-100/80"
            >
              <Smartphone size={13} className="shrink-0" />
              في وضع الشورت تُملأ الشاشة بالكامل مع تتبع ذكي لأهم عنصر متحرك (كرة، لاعب، وجه…) عبر Gemini.
            </motion.p>
          )}

          <p className="mt-5 border-t border-white/5 pt-4 text-[10px] leading-relaxed text-mist">
            يُحمَّل الفيديو ككاش مؤقت ويُحذف تلقائيًا فور انتهاء المعالجة — إلا إذا
            ضغطت «حفظ الفيديو الأصلي». حد أقصى للفيديو 15 دقيقة وللمقطع المقصوص 3 دقائق.
          </p>
        </div>
      </motion.section>

      {/* jobs */}
      <section className="relative z-10 mx-auto w-full max-w-4xl px-5 pt-12 pb-24">
        {jobs.length > 0 && (
          <div className="mb-5 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-black text-snow">
              <FilmIcon />
              سجلّ المهام
              {activeCount > 0 && (
                <span className="rounded-full border border-violet-400/30 bg-violet-500/15 px-2 py-0.5 text-[10px] font-bold text-violet-200">
                  {activeCount} نشطة
                </span>
              )}
            </h2>
          </div>
        )}
        <JobList
          jobs={jobs}
          onDelete={onDelete}
          onCancel={onCancel}
          onKeepOriginal={(id) => void onKeepOriginal(id)}
          keepBusyId={keepBusyId}
        />
      </section>

      <footer className="relative z-10 border-t border-white/5 py-8 text-center text-[10px] text-mist">
        <p dir="ltr" className="font-mono tracking-widest">
          yt-dlp · ffmpeg H.264 · Gemini Vision + Audio
        </p>
        <p className="mt-1">الإخراج متوافق مع Adobe Premiere Pro — FastStart / AAC / yuv420p</p>
      </footer>

      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        models={models}
        info={settingsInfo}
        onSaved={(s) => {
          setSettingsInfo(s);
          setModel(s.defaultModel);
        }}
      />
    </div>
  );
}

function FilmIcon() {
  return (
    <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500/30 to-cyan-500/20 ring-1 ring-white/15">
      <Clapperboard size={13} className="text-violet-200" />
    </span>
  );
}
