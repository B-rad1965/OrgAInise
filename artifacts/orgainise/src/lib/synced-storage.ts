/**
 * Dual-write layer — localStorage remains the source of truth.
 * When the user is authenticated, every write also fires a background
 * API call to persist the data to PostgreSQL. API failures are swallowed
 * silently; they never block or break the localStorage operation.
 *
 * Usage: replace `useStorage()` with `useSyncedStorage()` — identical API.
 */
import { useEffect } from "react";
import { useAuth } from "@workspace/replit-auth-web";
import { useStorage, Storage, type Project, type MemoryItem, type SessionHistory } from "./storage";

const SYNC_DONE_KEY = "orgainise_db_synced";

/* ─── Fire-and-forget API helper ─────────────────────────────────── */

async function apiFetch(method: string, path: string, body?: unknown): Promise<void> {
  try {
    const res = await fetch(`/api${path}`, {
      method,
      credentials: "include",
      headers: body !== undefined ? { "Content-Type": "application/json" } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      console.warn(`[OrgAInise] DB sync ${method} /api${path} → ${res.status} (localStorage preserved)`);
    }
  } catch {
    console.warn(`[OrgAInise] DB sync ${method} /api${path} failed — offline? (localStorage preserved)`);
  }
}

/** Returns true only when the server accepted the sync (2xx). */
async function dbSyncAll(data: {
  projects: Project[];
  memories: MemoryItem[];
  history: SessionHistory[];
}): Promise<boolean> {
  try {
    const res = await fetch("/api/sync", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      console.warn(`[OrgAInise] Initial sync failed → ${res.status} (localStorage preserved)`);
      return false;
    }
    return true;
  } catch {
    console.warn("[OrgAInise] Initial sync failed — offline? (localStorage preserved)");
    return false;
  }
}

function dbSaveProject(p: Project)        { return apiFetch("POST",   "/projects",                      p); }
function dbDeleteProject(id: string)      { return apiFetch("DELETE", `/projects/${id}`);                   }
function dbSaveMemory(m: MemoryItem)      { return apiFetch("PUT",    `/memories/${m.id}`,             m); }
function dbDeleteMemory(id: string)       { return apiFetch("DELETE", `/memories/${id}`);                   }
function dbSaveHistory(h: SessionHistory) { return apiFetch("POST",   `/projects/${h.projectId}/history`, h); }

/* ─── useSyncedStorage ────────────────────────────────────────────── */

/**
 * Drop-in replacement for `useStorage()`.
 * Returns the same `{ stamp, Storage }` shape, but write methods
 * dual-write to PostgreSQL in the background when the user is signed in.
 * Reads always come from localStorage. Failures are silent.
 */
export function useSyncedStorage() {
  const base            = useStorage();
  const { isAuthenticated } = useAuth();

  /* On first sign-in this browser session: push localStorage snapshot → DB */
  useEffect(() => {
    if (!isAuthenticated) return;
    if (sessionStorage.getItem(SYNC_DONE_KEY) === "1") return;

    // Mark immediately — prevents concurrent renders from double-firing
    sessionStorage.setItem(SYNC_DONE_KEY, "1");

    const projects = Storage.getProjects();
    const memories = Storage.getMemories();
    const history  = Storage.getAllHistory();
    const total    = projects.length + memories.length + history.length;

    if (total === 0) return; // nothing to sync — skip silently

    console.log(
      `[OrgAInise] Login sync: pushing ${projects.length} projects, ` +
      `${memories.length} memories, ${history.length} history entries to DB`,
    );

    void dbSyncAll({ projects, memories, history }).then((ok) => {
      if (!ok) return;
      // Notify the Layout (and any other listeners) so they can show a confirmation
      window.dispatchEvent(
        new CustomEvent("orgainise:synced", {
          detail: { projects: projects.length, memories: memories.length, history: history.length },
        }),
      );
    });
  }, [isAuthenticated]);

  /* Synced write methods — localStorage first, DB call in background */
  const syncedStorage = {
    ...Storage,

    saveProject(project: Project) {
      Storage.saveProject(project);
      if (isAuthenticated) void dbSaveProject(project);
    },

    deleteProject(id: string) {
      Storage.deleteProject(id);
      if (isAuthenticated) void dbDeleteProject(id);
    },

    duplicateProject(id: string): Project | null {
      const copy = Storage.duplicateProject(id);
      if (copy && isAuthenticated) void dbSaveProject(copy);
      return copy;
    },

    saveMemory(memory: MemoryItem) {
      Storage.saveMemory(memory);
      if (isAuthenticated) void dbSaveMemory(memory);
    },

    deleteMemory(id: string) {
      Storage.deleteMemory(id);
      if (isAuthenticated) void dbDeleteMemory(id);
    },

    saveHistory(history: SessionHistory) {
      Storage.saveHistory(history);
      if (isAuthenticated) void dbSaveHistory(history);
    },
  };

  return { stamp: base.stamp, Storage: syncedStorage };
}
