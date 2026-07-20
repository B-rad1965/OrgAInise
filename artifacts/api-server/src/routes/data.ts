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

class SyncOwnershipConflictError extends Error {}

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
      setWhere: eq(projectsTable.userId, req.user.id),
    })
    .returning();
  if (!row) { res.status(409).json({ error: "Project ID is already in use" }); return; }
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
        setWhere: and(
          eq(memoriesTable.userId, req.user.id),
          eq(memoriesTable.projectId, projectId),
        ),
      })
      .returning();
    if (!row) { res.status(409).json({ error: "Memory item ID is already in use" }); return; }
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
        setWhere: and(
          eq(sessionHistoryTable.userId, req.user.id),
          eq(sessionHistoryTable.projectId, projectId),
        ),
      })
      .returning();
    if (!row) { res.status(409).json({ error: "Session history ID is already in use" }); return; }

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

/** Pull all data for the authenticated user in one request (used on new-device login). */
router.get("/sync", async (req: Request, res: Response): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Authentication required" }); return; }

  const [projects, memories, historyRows] = await Promise.all([
    db.select().from(projectsTable)
      .where(eq(projectsTable.userId, req.user.id))
      .orderBy(desc(projectsTable.updatedAt)),
    db.select().from(memoriesTable)
      .where(eq(memoriesTable.userId, req.user.id))
      .orderBy(asc(memoriesTable.createdAt)),
    db.select().from(sessionHistoryTable)
      .where(eq(sessionHistoryTable.userId, req.user.id))
      .orderBy(desc(sessionHistoryTable.createdAt)),
  ]);

  res.json({
    projects: projects.map(projectToDto),
    memories: memories.map(memoryToDto),
    history:  historyRows.map(historyToDto),
  });
});

router.post("/sync", async (req: Request, res: Response): Promise<void> => {
  if (!req.isAuthenticated()) { res.status(401).json({ error: "Authentication required" }); return; }
  const parsed = SyncDataBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { projects, memories, history } = parsed.data;
  const userId = req.user.id;

  try {
    await db.transaction(async (tx) => {
      const projectIds = [...new Set([
        ...projects.map(p => p.id),
        ...memories.map(m => m.projectId),
        ...history.map(h => h.projectId),
      ])];

      const [existingProjects, existingMemories, existingHistory] = await Promise.all([
        projectIds.length > 0
          ? tx.select({ id: projectsTable.id, userId: projectsTable.userId })
              .from(projectsTable).where(inArray(projectsTable.id, projectIds))
          : [],
        memories.length > 0
          ? tx.select({
              id: memoriesTable.id,
              userId: memoriesTable.userId,
              projectId: memoriesTable.projectId,
            })
              .from(memoriesTable).where(inArray(memoriesTable.id, memories.map(m => m.id)))
          : [],
        history.length > 0
          ? tx.select({
              id: sessionHistoryTable.id,
              userId: sessionHistoryTable.userId,
              projectId: sessionHistoryTable.projectId,
            })
              .from(sessionHistoryTable).where(inArray(sessionHistoryTable.id, history.map(h => h.id)))
          : [],
      ]);

      const hasForeignOwner = [...existingProjects, ...existingMemories, ...existingHistory]
        .some(row => row.userId !== userId);
      const incomingMemoryProjects = new Map(memories.map(m => [m.id, m.projectId]));
      const incomingHistoryProjects = new Map(history.map(h => [h.id, h.projectId]));
      const hasMismatchedParent = existingMemories.some(m =>
        incomingMemoryProjects.get(m.id) !== m.projectId,
      ) || existingHistory.some(h =>
        incomingHistoryProjects.get(h.id) !== h.projectId,
      );
      const incomingProjectIds = new Set(projects.map(p => p.id));
      const ownedProjectIds = new Set(existingProjects.filter(p => p.userId === userId).map(p => p.id));
      const hasMissingProject = projectIds.some(id =>
        !incomingProjectIds.has(id) && !ownedProjectIds.has(id),
      );

      if (hasForeignOwner || hasMismatchedParent || hasMissingProject) {
        throw new SyncOwnershipConflictError();
      }

      if (projects.length > 0) {
        const inserted = await tx
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
            setWhere: eq(projectsTable.userId, userId),
          })
          .returning({ id: projectsTable.id });
        if (inserted.length !== projects.length) throw new SyncOwnershipConflictError();
      }

      if (memories.length > 0) {
        const inserted = await tx
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
            setWhere: and(
              eq(memoriesTable.userId, userId),
              sql`${memoriesTable.projectId} = excluded.project_id`,
            ),
          })
          .returning({ id: memoriesTable.id });
        if (inserted.length !== memories.length) throw new SyncOwnershipConflictError();
      }

      if (history.length > 0) {
        const inserted = await tx
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
            setWhere: and(
              eq(sessionHistoryTable.userId, userId),
              sql`${sessionHistoryTable.projectId} = excluded.project_id`,
            ),
          })
          .returning({ id: sessionHistoryTable.id });
        if (inserted.length !== history.length) throw new SyncOwnershipConflictError();
      }
    });
  } catch (error) {
    if (error instanceof SyncOwnershipConflictError) {
      res.status(409).json({ error: "Sync rejected because one or more records are not owned by this account" });
      return;
    }
    throw error;
  }

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
