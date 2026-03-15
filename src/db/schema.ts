import {
  sqliteTable,
  text,
  integer,
  uniqueIndex,
  index,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    title: text("title").notNull(),
    status: text("status", {
      enum: ["active", "ended", "exporting", "exported"],
    })
      .default("active")
      .notNull(),
    createdAt: text("created_at")
      .default(sql`(datetime('now'))`)
      .notNull(),
    endedAt: text("ended_at"),
  },
  (table) => [index("sessions_status_idx").on(table.status)]
);

export const frames = sqliteTable(
  "frames",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    sessionId: text("session_id")
      .references(() => sessions.id)
      .notNull(),
    frameNumber: integer("frame_number").notNull(),
    promptText: text("prompt_text").notNull(),
    artifactHtml: text("artifact_html").notNull(),
    acknowledgment: text("acknowledgment").notNull(),
    screenshotUrl: text("screenshot_url"),
    createdAt: text("created_at")
      .default(sql`(datetime('now'))`)
      .notNull(),
  },
  (table) => [
    uniqueIndex("frames_session_frame_idx").on(
      table.sessionId,
      table.frameNumber
    ),
  ]
);

export const systemPrompts = sqliteTable("system_prompts", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  content: text("content").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).default(true).notNull(),
  createdAt: text("created_at")
    .default(sql`(datetime('now'))`)
    .notNull(),
});

export const exportJobs = sqliteTable(
  "export_jobs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    sessionId: text("session_id")
      .references(() => sessions.id)
      .notNull(),
    format: text("format", { enum: ["mp4", "gif", "zip"] }).notNull(),
    status: text("status", {
      enum: ["pending", "processing", "done", "error"],
    })
      .default("pending")
      .notNull(),
    outputUrl: text("output_url"),
    errorMessage: text("error_message"),
    createdAt: text("created_at")
      .default(sql`(datetime('now'))`)
      .notNull(),
    updatedAt: text("updated_at")
      .default(sql`(datetime('now'))`)
      .notNull(),
  },
  (table) => [index("export_jobs_status_idx").on(table.status)]
);

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at")
    .default(sql`(datetime('now'))`)
    .notNull(),
});
