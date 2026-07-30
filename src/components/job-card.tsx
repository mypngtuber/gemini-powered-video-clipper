"use client";

import { motion, AnimatePresence } from "framer-motion";
import {
  AudioLines,
  BadgeCheck,
  CircleCheck,
  CloudDownload,
  Cpu,
  Download,
  Film,
  Loader2,
  MonitorPlay,
  ScanSearch,
  Scissors,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";

export interface Job {
  id: string;
  url: string;
  prompt: string;
  aspectRatio: string;
  model: string;
  status: string;
  progress: number;
  step: string;
  error: string | null;
  title: string | null;
  durationMs: number | null;
  width: number | null;
  height: number | null;
  framesCount: number;
  segmentStartMs: number | null;
  segmentEndMs: number | null;
  caption: string | null;
  mainSubject: string | null;
  hasClip: boolean;
  hasOriginal: boolean;
  keepOriginal: boolean;
  sourceCleaned: boolean;
  createdAt: string;
}

export function fmtMs(ms: number | null | undefined): string {
  if (ms == null) return "—";
  const s = ms / 1000;
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}:${r.toFixed(1).padStart(4, "0")}`;
}

const STAGE_DEFS = [
  { key: "downloading", label: "تحميل", icon: CloudDownload },
  { key: "extracting", label: "فريمات وصوت", icon: Film },
  { key: "analyzing", label: "تحليل Gemini", icon: ScanSearch },
  { key: "tracking", label: "تتبع العنصر", icon: AudioLines },
  { key: "cutting", label: "قص H.264", icon: Scissors },
];

function stageIndex(status: string, aspect: string): number {
  const keys = STAGE_DEFS.map((s) => s.key).filter(
    (k) => aspect === "9:16" || k !== "tracking"
  );
  const i = keys.indexOf(status);
  if (status === "queued") return -1;
  if (i === -1) return keys.length;
  return i;
}

interface Props {
  job: Job;
  onDelete: (id: string) => void;
  onCancel: (id: string) => void;
  onKeepOriginal: (id: string) => void;
  keepBusy: boolean;
}

export function JobCard({ job, onDelete, onCancel, onKeepOriginal, keepBusy }: Props) {
  const active = !["done", "error"].includes(job.status);
  const errored = job.status === "error";
  const done = job.status === "done";
  const stages = STAGE_DEFS.filter(
    (s) => job.aspectRatio === "9:16" || s.key !== "tracking"
  );
  const curStage = stageIndex(done ? "done" : job.status, job.aspectRatio);
  const segLen =
    job.segmentStartMs != null && job.segmentEndMs != null
      ? (job.segmentEndMs - job.segmentStartMs) / 1000
      : null;

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 24, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.2 } }}
      transition={{ type: "spring", stiffness: 120, damping: 18 }}
      className="glass relative overflow-hidden rounded-3xl p-5 sm:p-7"
    >
      {/* corner glow */}
      <div
        className={`pointer-events-none absolute -top-24 -left-24 h-48 w-48 rounded-full blur-3xl ${
          errored ? "bg-rose-500/20" : done ? "bg-cyan-400/15" : "bg-violet-600/20"
        }`}
      />

      {/* header */}
      <div className="relative flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={job.status} />
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-fog" dir="ltr">
              <Cpu size={11} className="text-violet-300" />
              {job.model}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-fog" dir="ltr">
              <MonitorPlay size={11} className="text-cyan-300" />
              {job.aspectRatio}
            </span>
          </div>
          <p className="mt-3 line-clamp-1 text-base font-bold text-snow">{job.prompt}</p>
          <p className="mt-1 truncate text-xs text-mist" dir="ltr" style={{ textAlign: "right" }}>
            {job.url}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {active && (
            <button
              onClick={() => onCancel(job.id)}
              className="btn-ghost flex items-center gap-1.5 px-3 py-2 text-xs text-fog hover:text-rose-300"
              title="إلغاء"
            >
              <X size={14} /> إلغاء
            </button>
          )}
          {!active && (
            <button
              onClick={() => onDelete(job.id)}
              className="btn-ghost flex items-center gap-1.5 px-3 py-2 text-xs text-fog hover:text-rose-300"
              title="حذف"
            >
              <Trash2 size={14} /> حذف
            </button>
          )}
        </div>
      </div>

      {/* active state */}
      {active && (
        <div className="relative mt-6">
          {/* stepper */}
          <div className="flex items-center">
            {stages.map((s, i) => {
              const state = i < curStage ? "done" : i === curStage ? "run" : "wait";
              const Icon = s.icon;
              return (
                <div key={s.key} className="flex flex-1 items-center last:flex-none">
                  <div className="flex flex-col items-center gap-2">
                    <motion.div
                      animate={
                        state === "run"
                          ? { scale: [1, 1.12, 1], boxShadow: ["0 0 0 0 rgba(139,92,246,0.5)", "0 0 0 10px rgba(139,92,246,0)", "0 0 0 0 rgba(139,92,246,0)"] }
                          : {}
                      }
                      transition={state === "run" ? { duration: 1.6, repeat: Infinity } : {}}
                      className={`flex h-10 w-10 items-center justify-center rounded-full border ${
                        state === "done"
                          ? "border-cyan-400/40 bg-cyan-400/15 text-cyan-300"
                          : state === "run"
                            ? "border-violet-400/60 bg-violet-500/20 text-violet-200"
                            : "border-white/10 bg-white/5 text-mist"
                      }`}
                    >
                      {state === "done" ? (
                        <CircleCheck size={18} />
                      ) : state === "run" ? (
                        <Icon size={18} className="animate-pulse" />
                      ) : (
                        <Icon size={18} />
                      )}
                    </motion.div>
                    <span
                      className={`hidden text-[10px] font-semibold sm:block ${
                        state === "run" ? "text-violet-200" : state === "done" ? "text-cyan-300/80" : "text-mist"
                      }`}
                    >
                      {s.label}
                    </span>
                  </div>
                  {i < stages.length - 1 && (
                    <div className="mx-2 mb-0 h-px flex-1 sm:mb-6" >
                      <div className="h-full w-full bg-white/10">
                        <motion.div
                          className="h-full bg-gradient-to-l from-violet-500 to-cyan-400"
                          initial={false}
                          animate={{ width: i < curStage ? "100%" : "0%" }}
                          transition={{ duration: 0.6 }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* progress */}
          <div className="mt-6">
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="flex items-center gap-2 text-fog">
                <Loader2 size={13} className="animate-spin text-violet-300" />
                {job.step}
              </span>
              <span className="font-mono text-cyan-300" dir="ltr">{job.progress}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/8">
              <motion.div
                className="progress-shimmer h-full rounded-full"
                initial={{ width: "0%" }}
                animate={{ width: `${job.progress}%` }}
                transition={{ type: "spring", stiffness: 60, damping: 20 }}
              />
            </div>
          </div>

          {/* frame strip */}
          {job.framesCount > 0 && job.status !== "queued" && job.status !== "downloading" && (
            <div className="mt-5">
              <div className="mb-2 text-[11px] font-semibold tracking-wide text-mist">
                الفريمات المستخرجة ({job.framesCount})
              </div>
              <div className="flex gap-1.5 overflow-x-auto rounded-xl border border-white/8 bg-black/40 p-1.5">
                {Array.from({ length: job.framesCount }).map((_, i) => (
                  <motion.img
                    key={`${job.id}-${i}-${job.status}`}
                    src={`/api/files/${job.id}/frame-${i}.jpg`}
                    alt=""
                    initial={{ opacity: 0, scale: 0.85 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.05 }}
                    className="h-14 w-auto shrink-0 rounded-lg object-cover ring-1 ring-white/10"
                    loading="lazy"
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* error state */}
      {errored && (
        <div className="relative mt-5 flex items-start gap-3 rounded-2xl border border-rose-400/25 bg-rose-500/10 p-4">
          <TriangleAlert size={20} className="mt-0.5 shrink-0 text-rose-300" />
          <div>
            <p className="text-sm font-bold text-rose-200">فشلت المهمة</p>
            <p className="mt-1 text-sm leading-relaxed text-rose-200/75">{job.error}</p>
          </div>
        </div>
      )}

      {/* done state */}
      {done && (
        <div className="relative mt-6">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
            <div
              className={`relative overflow-hidden rounded-2xl border border-white/10 bg-black ${
                job.aspectRatio === "9:16" ? "mx-auto max-w-[260px]" : ""
              }`}
            >
              <video
                controls
                playsInline
                preload="metadata"
                poster={`/api/files/${job.id}/thumb.jpg`}
                src={`/api/files/${job.id}/clip.mp4`}
                className="max-h-[420px] w-full object-contain"
              />
              <span className="pointer-events-none absolute top-2.5 right-2.5 rounded-md bg-black/60 px-2 py-1 text-[10px] font-bold tracking-wide text-cyan-300 ring-1 ring-white/15 backdrop-blur" dir="ltr">
                H.264 • Premiere Ready
              </span>
            </div>

            <div className="flex flex-col">
              {job.caption && (
                <blockquote className="border-r-2 border-violet-400/60 pr-3 text-sm leading-relaxed text-fog">
                  {job.caption}
                </blockquote>
              )}

              <div className="mt-4 flex flex-wrap gap-2 text-[11px]">
                <MetaChip label="مدة المقطع" value={segLen ? `${segLen.toFixed(1)} ث` : "—"} />
                <MetaChip
                  label="الفاصل الزمني"
                  value={`${fmtMs(job.segmentStartMs)} ← ${fmtMs(job.segmentEndMs)}`}
                  ltr
                />
                <MetaChip
                  label="النسبة"
                  value={job.aspectRatio}
                  ltr
                />
                {job.mainSubject && job.aspectRatio === "9:16" && (
                  <MetaChip label="تتبع" value={job.mainSubject} ltr />
                )}
                {job.durationMs != null && (
                  <MetaChip label="الفيديو الأصلي" value={fmtMs(job.durationMs)} ltr />
                )}
              </div>

              <div className="mt-auto flex flex-col gap-2.5 pt-5">
                <a
                  href={`/api/files/${job.id}/clip.mp4`}
                  download
                  className="btn-primary flex items-center justify-center gap-2 px-5 py-3 text-sm font-bold text-white"
                >
                  <Download size={16} />
                  تحميل المقطع المقصوص (H.264)
                </a>
                {job.hasOriginal ? (
                  <a
                    href={`/api/files/${job.id}/original`}
                    download
                    className="btn-ghost flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-semibold text-cyan-200"
                  >
                    <BadgeCheck size={15} />
                    الأصلي محفوظ في المكتبة — تحميل
                  </a>
                ) : job.sourceCleaned ? (
                  <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-white/10 px-5 py-2.5 text-[11px] text-mist">
                    تم حذف كاش الفيديو الأصلي تلقائيًا بعد المعالجة
                  </div>
                ) : (
                  <button
                    onClick={() => onKeepOriginal(job.id)}
                    disabled={keepBusy}
                    className="btn-ghost flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-semibold text-amber-200"
                  >
                    {keepBusy ? <Loader2 size={15} className="animate-spin" /> : <BadgeCheck size={15} />}
                    حفظ الفيديو الأصلي قبل حذف الكاش
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </motion.article>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { t: string; cls: string; icon?: boolean }> = {
    queued: { t: "في الانتظار", cls: "border-white/15 bg-white/5 text-fog" },
    downloading: { t: "جار التحميل", cls: "border-sky-400/30 bg-sky-400/10 text-sky-200", icon: true },
    extracting: { t: "استخراج", cls: "border-amber-400/30 bg-amber-400/10 text-amber-200", icon: true },
    analyzing: { t: "تحليل ذكي", cls: "border-violet-400/40 bg-violet-400/10 text-violet-200", icon: true },
    tracking: { t: "تتبع العنصر", cls: "border-fuchsia-400/30 bg-fuchsia-400/10 text-fuchsia-200", icon: true },
    cutting: { t: "قص وتصدير", cls: "border-cyan-400/30 bg-cyan-400/10 text-cyan-200", icon: true },
    done: { t: "اكتمل", cls: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200" },
    error: { t: "خطأ", cls: "border-rose-400/30 bg-rose-400/10 text-rose-200" },
  };
  const m = map[status] ?? map.queued;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold ${m.cls}`}>
      {m.icon && <Loader2 size={11} className="animate-spin" />}
      {status === "done" && <BadgeCheck size={11} />}
      {m.t}
    </span>
  );
}

function MetaChip({ label, value, ltr }: { label: string; value: string; ltr?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-fog">
      <span className="text-mist">{label}:</span>
      <span className="font-semibold text-snow" dir={ltr ? "ltr" : undefined}>
        {value}
      </span>
    </span>
  );
}

export function JobList({
  jobs,
  onDelete,
  onCancel,
  onKeepOriginal,
  keepBusyId,
}: {
  jobs: Job[];
  onDelete: (id: string) => void;
  onCancel: (id: string) => void;
  onKeepOriginal: (id: string) => void;
  keepBusyId: string | null;
}) {
  return (
    <div className="flex flex-col gap-5">
      <AnimatePresence mode="popLayout">
        {jobs.map((j) => (
          <JobCard
            key={j.id}
            job={j}
            onDelete={onDelete}
            onCancel={onCancel}
            onKeepOriginal={onKeepOriginal}
            keepBusy={keepBusyId === j.id}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}
