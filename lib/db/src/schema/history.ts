import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { projectsTable } from "./projects";

export const sessionHistoryTable = pgTable("session_history", {
  id:        text("id").primaryKey(),
  userId:    text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  projectId: text("project_id").notNull().references(() => projectsTable.id, { onDelete: "cascade" }),
  notes:     text("notes").notNull(),
  summary:   text("summary"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const insertSessionHistorySchema = createInsertSchema(sessionHistoryTable).omit({ userId: true });
export type InsertSessionHistory = z.infer<typeof insertSessionHistorySchema>;
export type DbSessionHistory = typeof sessionHistoryTable.$inferSelect;
