import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, desc, asc, inArray, sql } from "drizzle-orm";
import { db, projectsTable, memoriesTable, sessionHistoryTable } from "@workspace/db";
import {
  UpsertProjectBody,
  UpsertMemoryBody,
  CreateSessionHistoryBody,
  SyncDataBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

/* ─── DTO converters ──────────────────────────────────────────────── */

type ProjectRow = typeof projectsTable.$inferSelect;
type MemoryRow  = typeof memoriesTable.$inferSelect;
type HistoryRow = typeof sessionHistoryTable.$inferSelect;

function projectToDto(r: ProjectRow) {
  return {
    id: r.id,
    name: r.name,
    type: r.type,
    categories: r.categories as string[],
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

function memoryToDto(r: MemoryRow) {
  return {
    id: r.id,
    projectId: r.projectId,
    text: r.text,
    category: r.category,
    importanceLevel: r.importanceLevel as "must-include" | "useful-context" | "archive-reference",
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

function historyToDto(r: HistoryRow) {
  return {
    id: r.id,
    projectId: r.projectId,
    rawNotes: r.notes,
    suggestions: (r.suggestionsJson ?? []) as Array<{
      suggestedText: string;
      category: string;
      importanceLevel: string;
      reason: string;
      conflictNote?: string | null;
    }>,
    approvedCount: r.approvedCount,
    createdAt: r.createdAt.toISOString(),
  };
}

/* ─── Projects ────────────────────────────────────────────────────── */

router.get("/projects", async (req: Request, res: Response): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Authentication required" }); return; }
  const rows = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.userId, req.user.id))
    .orderBy(desc(projectsTable.updatedAt));
  res.json({ projects: rows.map(projectToDto) });
});

router.post("/projects", async (req: Request, res: Response): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Authentication required" }); return; }
  const parsed = UpsertProjectBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { id, name, type, categories, createdAt, updatedAt } = parsed.data;
  const [row] = await db
    .insert(projectsTable)
    .values({ id, userId: req.user.id, name, type, categories, createdAt: new Date(createdAt), updatedAt: new Date(updatedAt) })
    .onConflictDoUpdate({
      target: projectsTable.id,
      set: { name, type, categories, updatedAt: new Date(updatedAt) },
    })
    .returning();
  res.json(projectToDto(row));
});

router.delete(
  "/projects/:projectId",
  async (req: Request<{ projectId: string }>, res: Response): Promise<void> => {
    if (!req.isAuthenticated()) { res.status(401).json({ error: "Authentication required" }); return; }
    const { projectId } = req.params;
    const [existing] = await db
      .select({ id: projectsTable.id, userId: projectsTable.userId })
      .from(projectsTable)
      .where(eq(projectsTable.id, projectId));
    if (!existing) { res.status(404).json({ error: "Project not found" }); return; }
    if (existing.userId !== req.user.id) { res.status(403).json({ error: "Forbidden" }); return; }
    await db.delete(projectsTable).where(eq(projectsTable.id, projectId));
    res.status(204).send();
  },
);

/* ─── Memories ────────────────────────────────────────────────────── */

router.get(
  "/projects/:projectId/memories",
  async (req: Request<{ projectId: string }>, res: Response): Promise<void> => {
    if (!req.isAuthenticated()) { res.status(401).json({ error: "Authentication required" }); return; }
    const { projectId } = req.params;
    const [project] = await db
      .select({ userId: projectsTable.userId })
      .from(projectsTable)
      .where(eq(projectsTable.id, projectId));
    if (!project) { res.status(404).json({ error: "Project not found" }); return; }
    if (project.userId !== req.user.id) { res.status(403).json({ error: "Forbidden" }); return; }
    const rows = await db
      .select()
      .from(memoriesTable)
      .where(eq(memoriesTable.projectId, projectId))
      .orderBy(asc(memoriesTable.createdAt));
    res.json({ memories: rows.map(memoryToDto) });
  },
);

router.put(
  "/memories/:memoryId",
  async (req: Request<{ memoryId: string }>, res: Response): Promise<void> => {
    if (!req.isAuthenticated()) { res.status(401).json({ error: "Authentication required" }); return; }
    const parsed = UpsertMemoryBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

    const { id, projectId, text, category, importanceLevel, createdAt, updatedAt } = parsed.data;
    const [project] = await db
      .select({ userId: projectsTable.userId })
      .from(projectsTable)
      .where(eq(projectsTable.id, projectId));
    if (!project) { res.status(404).json({ error: "Project not found" }); return; }
    if (project.userId !== req.user.id) { res.status(403).json({ error: "Forbidden" }); return; }

    const [row] = await db
      .insert(memoriesTable)
      .values({ id, userId: req.user.id, projectId, text, category, importanceLevel, createdAt: new Date(createdAt), updatedAt: new Date(updatedAt) })
      .onConflictDoUpdate({
        target: memoriesTable.id,
        set: { text, category, importanceLevel, updatedAt: new Date(updatedAt) },
      })
      .returning();
    res.json(memoryToDto(row));
  },
);

router.delete(
  "/memories/:memoryId",
  async (req: Request<{ memoryId: string }>, res: Response): Promise<void> => {
    if (!req.isAuthenticated()) { res.status(401).json({ error: "Authentication required" }); return; }
    const { memoryId } = req.params;
    const [existing] = await db
      .select({ id: memoriesTable.id, userId: memoriesTable.userId })
      .from(memoriesTable)
      .where(eq(memoriesTable.id, memoryId));
    if (!existing) { res.status(404).json({ error: "Memory item not found" }); return; }
    if (existing.userId !== req.user.id) { res.status(403).json({ error: "Forbidden" }); return; }
    await db.delete(memoriesTable).where(eq(memoriesTable.id, memoryId));
    res.status(204).send();
  },
);

/* ─── Session history ─────────────────────────────────────────────── */

router.get(
  "/projects/:projectId/history",
  async (req: Request<{ projectId: string }>, res: Response): Promise<void> => {
    if (!req.isAuthenticated()) { res.status(401).json({ error: "Authentication required" }); return; }
    const { projectId } = req.params;
    const [project] = await db
      .select({ userId: projectsTable.userId })
      .from(projectsTable)
      .where(eq(projectsTable.id, projectId));
    if (!project) { res.status(404).json({ error: "Project not found" }); return; }
    if (project.userId !== req.user.id) { res.status(403).json({ error: "Forbidden" }); return; }
    const rows = await db
      .select()
      .from(sessionHistoryTable)
      .where(eq(sessionHistoryTable.projectId, projectId))
      .orderBy(desc(sessionHistoryTable.createdAt));
    res.json({ history: rows.map(historyToDto) });
  },
);

router.post(
  "/projects/:projectId/history",
  async (req: Request<{ projectId: string }>, res: Response): Promise<void> => {
    if (!req.isAuthenticated()) { res.status(401).json({ error: "Authentication required" }); return; }
    const { projectId } = req.params;
    const parsed = CreateSessionHistoryBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

    const [project] = await db
      .select({ userId: projectsTable.userId })
      .from(projectsTable)
      .where(eq(projectsTable.id, projectId));
    if (!project) { res.status(404).json({ error: "Project not found" }); return; }
    if (project.userId !== req.user.id) { res.status(403).json({ error: "Forbidden" }); return; }

    const { id, rawNotes, suggestions, approvedCount, createdAt } = parsed.data;
    const [row] = await db
      .insert(sessionHistoryTable)
      .values({
        id, userId: req.user.id, projectId,
        notes: rawNotes,
        suggestionsJson: suggestions as object[],
        approvedCount,
        createdAt: new Date(createdAt),
      })
      .onConflictDoUpdate({
        target: sessionHistoryTable.id,
        set: { notes: rawNotes, suggestionsJson: suggestions as object[], approvedCount },
      })
      .returning();

    // Enforce the 10-entry cap per project
    const allEntries = await db
      .select({ id: sessionHistoryTable.id })
      .from(sessionHistoryTable)
      .where(eq(sessionHistoryTable.projectId, projectId))
      .orderBy(desc(sessionHistoryTable.createdAt));
    if (allEntries.length > 10) {
      const overflow = allEntries.slice(10).map(e => e.id);
      await db.delete(sessionHistoryTable).where(inArray(sessionHistoryTable.id, overflow));
    }

    res.json(historyToDto(row));
  },
);

/* ─── Bulk sync ───────────────────────────────────────────────────── */

router.post("/sync", async (req: Request, res: Response): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Authentication required" }); return; }
  const parsed = SyncDataBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { projects, memories, history } = parsed.data;
  const userId = req.user.id;

  await db.transaction(async (tx) => {
    if (projects.length > 0) {
      await tx
        .insert(projectsTable)
        .values(projects.map(p => ({
          id: p.id, userId, name: p.name, type: p.type, categories: p.categories,
          createdAt: new Date(p.createdAt), updatedAt: new Date(p.updatedAt),
        })))
        .onConflictDoUpdate({
          target: projectsTable.id,
          set: {
            name:       sql`excluded.name`,
            type:       sql`excluded.type`,
            categories: sql`excluded.categories`,
            updatedAt:  sql`excluded.updated_at`,
          },
        });
    }

    if (memories.length > 0) {
      await tx
        .insert(memoriesTable)
        .values(memories.map(m => ({
          id: m.id, userId, projectId: m.projectId,
          text: m.text, category: m.category, importanceLevel: m.importanceLevel,
          createdAt: new Date(m.createdAt), updatedAt: new Date(m.updatedAt),
        })))
        .onConflictDoUpdate({
          target: memoriesTable.id,
          set: {
            text:            sql`excluded.text`,
            category:        sql`excluded.category`,
            importanceLevel: sql`excluded.importance_level`,
            updatedAt:       sql`excluded.updated_at`,
          },
        });
    }

    if (history.length > 0) {
      await tx
        .insert(sessionHistoryTable)
        .values(history.map(h => ({
          id: h.id, userId, projectId: h.projectId,
          notes: h.rawNotes,
          suggestionsJson: h.suggestions as object[],
          approvedCount: h.approvedCount,
          createdAt: new Date(h.createdAt),
        })))
        .onConflictDoUpdate({
          target: sessionHistoryTable.id,
          set: {
            notes:           sql`excluded.notes`,
            suggestionsJson: sql`excluded.suggestions_json`,
            approvedCount:   sql`excluded.approved_count`,
          },
        });
    }
  });

  // Enforce 10-entry cap per project
  if (history.length > 0) {
    const projectIds = [...new Set(history.map(h => h.projectId))];
    for (const pid of projectIds) {
      const all = await db
        .select({ id: sessionHistoryTable.id })
        .from(sessionHistoryTable)
        .where(and(eq(sessionHistoryTable.projectId, pid), eq(sessionHistoryTable.userId, userId)))
        .orderBy(desc(sessionHistoryTable.createdAt));
      if (all.length > 10) {
        await db.delete(sessionHistoryTable).where(inArray(sessionHistoryTable.id, all.slice(10).map(e => e.id)));
      }
    }
  }

  res.json({
    syncedProjects: projects.length,
    syncedMemories: memories.length,
    syncedHistory: history.length,
  });
});

export default router;
