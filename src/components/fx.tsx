"use client";

import { motion } from "framer-motion";

export function BackgroundFX() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden>
      {/* base vignette */}
      <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_0%,#141024_0%,#07060d_55%,#050409_100%)]" />

      {/* aurora orbs */}
      <motion.div
        className="absolute -top-40 right-[8%] h-[34rem] w-[34rem] rounded-full opacity-40 blur-[110px]"
        style={{ background: "radial-gradient(circle, #7c3aed 0%, transparent 65%)" }}
        animate={{ x: [0, -60, 30, 0], y: [0, 40, -20, 0], scale: [1, 1.1, 0.95, 1] }}
        transition={{ duration: 26, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute top-[35%] left-[-10%] h-[30rem] w-[30rem] rounded-full opacity-30 blur-[120px]"
        style={{ background: "radial-gradient(circle, #0e7490 0%, transparent 65%)" }}
        animate={{ x: [0, 70, -20, 0], y: [0, -50, 30, 0], scale: [1, 0.9, 1.08, 1] }}
        transition={{ duration: 32, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute bottom-[-12rem] right-[30%] h-[26rem] w-[26rem] rounded-full opacity-25 blur-[100px]"
        style={{ background: "radial-gradient(circle, #db2777 0%, transparent 65%)" }}
        animate={{ x: [0, 40, -40, 0], y: [0, -30, 10, 0] }}
        transition={{ duration: 24, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* blueprint grid */}
      <div
        className="absolute inset-0 opacity-[0.13]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.35) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.35) 1px, transparent 1px)",
          backgroundSize: "72px 72px",
          maskImage: "radial-gradient(70% 60% at 50% 20%, black 30%, transparent 100%)",
        }}
      />

      {/* film frame edges */}
      <div className="absolute inset-y-0 right-4 hidden w-2.5 film-perf opacity-20 lg:block" />
      <div className="absolute inset-y-0 left-4 hidden w-2.5 film-perf opacity-20 lg:block" />
    </div>
  );
}
