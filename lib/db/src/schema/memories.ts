import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { projectsTable } from "./projects";

export const memoriesTable = pgTable("memories", {
  id:              text("id").primaryKey(),
  userId:          text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  projectId:       text("project_id").notNull().references(() => projectsTable.id, { onDelete: "cascade" }),
  text:            text("text").notNull(),
  category:        text("category").notNull(),
  importanceLevel: text("importance_level").notNull(),
  createdAt:       timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt:       timestamp("updated_at", { withTimezone: true }).notNull(),
});

export const insertMemorySchema = createInsertSchema(memoriesTable).omit({ userId: true });
export type InsertMemory = z.infer<typeof insertMemorySchema>;
export type DbMemory = typeof memoriesTable.$inferSelect;
