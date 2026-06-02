import { pgTable, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const projectsTable = pgTable("projects", {
  id:         text("id").primaryKey(),
  userId:     text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  name:       text("name").notNull(),
  type:       text("type").notNull(),
  categories: jsonb("categories").notNull().$type<string[]>().default([]),
  createdAt:  timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt:  timestamp("updated_at", { withTimezone: true }).notNull(),
});

export const insertProjectSchema = createInsertSchema(projectsTable).omit({ userId: true });
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type DbProject = typeof projectsTable.$inferSelect;
