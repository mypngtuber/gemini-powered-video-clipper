import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";

export const settings = pgTable("settings", {
  id: text("id").primaryKey().default("global"),
  geminiApiKey: text("gemini_api_key"),
  defaultModel: text("default_model").default("gemini-3.6-flash"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const jobs = pgTable("jobs", {
  id: text("id").primaryKey(),
  url: text("url").notNull(),
  prompt: text("prompt").notNull(),
  aspectRatio: text("aspect_ratio").notNull().default("16:9"),
  model: text("model").notNull().default("gemini-3.6-flash"),
  // queued | downloading | extracting | analyzing | tracking | cutting | done | error
  status: text("status").notNull().default("queued"),
  progress: integer("progress").notNull().default(0),
  step: text("step").notNull().default("في الانتظار"),
  error: text("error"),
  title: text("title"),
  durationMs: integer("duration_ms"),
  width: integer("width"),
  height: integer("height"),
  framesCount: integer("frames_count").notNull().default(0),
  segmentStartMs: integer("segment_start_ms"),
  segmentEndMs: integer("segment_end_ms"),
  caption: text("caption"),
  mainSubject: text("main_subject"),
  analysis: jsonb("analysis"),
  hasClip: boolean("has_clip").notNull().default(false),
  hasOriginal: boolean("has_original").notNull().default(false),
  keepOriginal: boolean("keep_original").notNull().default(false),
  sourceCleaned: boolean("source_cleaned").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export type SettingsRow = typeof settings.$inferSelect;
export type JobRow = typeof jobs.$inferSelect;
