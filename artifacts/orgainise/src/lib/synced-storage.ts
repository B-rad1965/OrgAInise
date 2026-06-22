/**
 * Dual-write layer — localStorage remains the source of truth at runtime.
 *
 * On sign-in the hook checks whether localStorage has any real (non-demo)
 * projects:
 *
 *   • Empty (new device)  → PULL from GET /api/sync, hydrate localStorage,
 *                           then the app renders normally from localStorage.
 *   • Has local data      → PUSH localStorage snapshot to POST /api/sync
 *                           (existing behaviour — keeps DB up to date).
 *
 * Every subsequent write dual-writes: localStorage first (never blocked),
 * then a background API call to PostgreSQL. API failures are swallowed
 * silently; they never break the localStorage operation.
 *
 * Usage: replace `useStorage()` with `useSyncedStorage()` — identical API.
 */
import { useEffect } from "react";
import { useAuth } from "@workspace/replit-auth-web";
import { useStorage, Storage, type Project, type MemoryItem, type SessionHistory } from "./storage";

const SYNC_DONE_KEY  = "orgainise_db_synced";
const DEMO_PROJECT_ID = "__demo__";

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

/** Push a full localStorage snapshot to the server. Returns true on success. */
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

/**
 * Pull all data for the current user from the server and hydrate localStorage.
 * Used on new-device login when localStorage is empty.
 * Returns true if data was pulled and written.
 */
async function dbPullAll(): Promise<boolean> {
  try {
    const res = await fetch("/api/sync", { credentials: "include" });
    if (!res.ok) {
      console.warn(`[OrgAInise] DB pull failed → ${res.status}`);
      return false;
    }
    const data = await res.json() as {
      projects: Project[];
      memories: MemoryItem[];
      history:  SessionHistory[];
    };
    const total = data.projects.length + data.memories.length + data.history.length;
    if (total === 0) {
      console.log("[OrgAInise] DB pull: server has no data yet — nothing to restore");
      return false;
    }
    console.log(
      `[OrgAInise] DB pull: restoring ${data.projects.length} projects, ` +
      `${data.memories.length} memories, ${data.history.length} history entries`,
    );
    Storage.hydrate(data);
    return true;
  } catch {
    console.warn("[OrgAInise] DB pull failed — offline?");
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
  const base                = useStorage();
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    if (!isAuthenticated) return;
    if (sessionStorage.getItem(SYNC_DONE_KEY) === "1") return;

    // Mark immediately — prevents concurrent renders from double-firing
    sessionStorage.setItem(SYNC_DONE_KEY, "1");

    // Count real (non-demo) local data to decide push vs pull
    const localProjects = Storage.getProjects().filter(p => p.id !== DEMO_PROJECT_ID);
    const localMemories = Storage.getMemories().filter(m => m.projectId !== DEMO_PROJECT_ID);
    const localHistory  = Storage.getAllHistory().filter(h => h.projectId !== DEMO_PROJECT_ID);
    const localTotal    = localProjects.length + localMemories.length + localHistory.length;

    if (localTotal === 0) {
      // ── New device: pull cloud data into localStorage ──────────────
      console.log("[OrgAInise] New device detected — pulling projects from server…");
      void dbPullAll().then((pulled) => {
        if (!pulled) return;
        window.dispatchEvent(
          new CustomEvent("orgainise:pulled", {
            detail: { message: "Projects restored from your account" },
          }),
        );
      });
    } else {
      // ── Known device: push localStorage snapshot to keep DB in sync ─
      console.log(
        `[OrgAInise] Login sync: pushing ${localProjects.length} projects, ` +
        `${localMemories.length} memories, ${localHistory.length} history entries to DB`,
      );
      void dbSyncAll({ projects: localProjects, memories: localMemories, history: localHistory }).then((ok) => {
        if (!ok) return;
        window.dispatchEvent(
          new CustomEvent("orgainise:synced", {
            detail: {
              projects: localProjects.length,
              memories: localMemories.length,
              history:  localHistory.length,
            },
          }),
        );
      });
    }
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
