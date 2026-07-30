"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { KeyRound, X, Loader2, ShieldCheck, Cpu, CircleCheck } from "lucide-react";

export interface SettingsInfo {
  defaultModel: string;
  hasKey: boolean;
  keyPreview: string | null;
  keySource: "settings" | "env" | null;
}

export function SettingsDialog({
  open,
  onClose,
  models,
  info,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  models: string[];
  info: SettingsInfo | null;
  onSaved: (s: SettingsInfo) => void;
}) {
  const [key, setKey] = useState("");
  const [model, setModel] = useState(info?.defaultModel ?? models[0]);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setModel(info?.defaultModel ?? models[0]);
      setKey("");
      setSaved(false);
      setError(null);
    }
  }, [open, info, models]);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          geminiApiKey: key.trim() || undefined,
          defaultModel: model,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "تعذر الحفظ");
      onSaved({
        defaultModel: data.defaultModel,
        hasKey: data.hasKey,
        keyPreview: data.keyPreview,
        keySource: "settings",
      });
      setSaved(true);
      setTimeout(() => onClose(), 900);
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطأ");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 220, damping: 24 }}
            className="glass fixed inset-x-4 top-[12vh] z-50 mx-auto max-w-md rounded-3xl p-6 sm:p-8"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500/30 to-cyan-500/20 ring-1 ring-white/15">
                  <KeyRound size={19} className="text-violet-200" />
                </span>
                <div>
                  <h2 className="text-lg font-black text-snow">إعدادات Gemini</h2>
                  <p className="text-xs text-mist">مفتاح الـ API والموديل الافتراضي</p>
                </div>
              </div>
              <button onClick={onClose} className="btn-ghost p-2 text-fog" aria-label="إغلاق">
                <X size={16} />
              </button>
            </div>

            <div className="mt-6 space-y-5">
              <div>
                <label className="mb-2 block text-xs font-bold text-fog">
                  مفتاح Gemini API
                </label>
                <input
                  type="password"
                  dir="ltr"
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  placeholder={info?.keyPreview ?? "AIza..."}
                  className="field"
                  autoComplete="off"
                />
                <p className="mt-2 flex items-center gap-1.5 text-[11px] leading-relaxed text-mist">
                  <ShieldCheck size={12} className="shrink-0 text-emerald-300" />
                  {info?.hasKey
                    ? `المفتاح الحالي: ${info.keyPreview} ${info.keySource === "env" ? "(من متغير البيئة)" : ""} — أدخل مفتاحًا جديدًا لاستبداله.`
                    : "يُخزَّن المفتاح مشفرًا على الخادم فقط ولا يظهر في المتصفح."}
                </p>
              </div>

              <div>
                <label className="mb-2 flex items-center gap-1.5 text-xs font-bold text-fog">
                  <Cpu size={13} className="text-violet-300" />
                  الموديل الافتراضي
                </label>
                <select dir="ltr" value={model} onChange={(e) => setModel(e.target.value)} className="field">
                  {models.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>

              {error && (
                <p className="rounded-xl border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                  {error}
                </p>
              )}

              <button
                onClick={save}
                disabled={busy || (!key.trim() && model === info?.defaultModel)}
                className="btn-primary flex w-full items-center justify-center gap-2 px-5 py-3 text-sm font-bold text-white"
              >
                {busy ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : saved ? (
                  <CircleCheck size={16} />
                ) : (
                  <KeyRound size={16} />
                )}
                {saved ? "تم الحفظ" : "حفظ الإعدادات"}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
