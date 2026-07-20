/**
 * Dual-write layer — localStorage remains the source of truth at runtime.
 *
 * On sign-in the hook checks whether localStorage has any real (non-demo) projects:
 *   • Empty (new device)  → PULL from GET /api/sync → hydrate localStorage → UI re-renders.
 *   • Has local data      → PUSH localStorage snapshot to POST /api/sync.
 *
 * Every subsequent write dual-writes: localStorage first, then background API call.
 *
 * Race-condition fix: sync only fires once user.id is confirmed present, not just
 * when the isAuthenticated flag flips (which can fire before the user object loads).
 *
 * Exported helpers allow the sync diagnostic panel to call force push/pull directly.
 */
import { useEffect, useRef } from "react";
import { useAuth } from "@workspace/replit-auth-web";
import { useStorage, Storage, type Project, type MemoryItem, type SessionHistory } from "./storage";

export const DEMO_PROJECT_ID = "__demo__";
const SYNC_DONE_KEY = "orgainise_db_synced";
const SYNC_ERROR_KEY = "orgainise_cloud_sync_error";

/* ─── Sync result tracking ───────────────────────────────────────── */

export type SyncDirection = "pushed" | "pulled" | "skipped" | "paused" | "failed" | null;

export type SyncResult = {
  direction: SyncDirection;
  projects:  number;
  memories:  number;
  history:   number;
  error?:    string;
  userId?:   string;
  timestamp: number;
};

let _lastSync: SyncResult = { direction: null, projects: 0, memories: 0, history: 0, timestamp: 0 };
let _cloudWriteError: string | null = null;
export function getLastSyncResult(): SyncResult { return { ..._lastSync }; }
export function getCloudWriteError(): string | null {
  try {
    return sessionStorage.getItem(SYNC_ERROR_KEY) ?? _cloudWriteError;
  } catch {
    return _cloudWriteError;
  }
}

function recordCloudWriteFailure(error: string): void {
  _cloudWriteError = error;
  try {
    sessionStorage.removeItem(SYNC_DONE_KEY);
    sessionStorage.setItem(SYNC_ERROR_KEY, error);
  } catch {
    // The in-memory state and event still make the failure visible.
  }
  _lastSync = {
    direction: "failed",
    projects: 0,
    memories: 0,
    history: 0,
    error,
    timestamp: Date.now(),
  };
  window.dispatchEvent(new CustomEvent("orgainise:sync-error", { detail: { error } }));
}

function clearCloudWriteFailure(): void {
  _cloudWriteError = null;
  try {
    sessionStorage.removeItem(SYNC_ERROR_KEY);
  } catch {
    // Nothing else to clear when session storage is unavailable.
  }
}

function markSyncDone(): void {
  try {
    sessionStorage.setItem(SYNC_DONE_KEY, "1");
  } catch {
    // Sync still succeeded; only the session marker is unavailable.
  }
}

function clearSyncDone(): void {
  try {
    sessionStorage.removeItem(SYNC_DONE_KEY);
  } catch {
    // The live sync state remains authoritative for this page.
  }
}

/* ─── Local count helper (excludes demo) ─────────────────────────── */

export function getLocalCounts() {
  const projects = Storage.getProjects().filter(p => p.id !== DEMO_PROJECT_ID);
  const memories = Storage.getMemories().filter(m => m.projectId !== DEMO_PROJECT_ID);
  const history  = Storage.getAllHistory().filter(h => h.projectId !== DEMO_PROJECT_ID);
  return { projects: projects.length, memories: memories.length, history: history.length };
}

/* ─── Internal fire-and-forget helper ───────────────────────────── */

async function apiFetch(method: string, path: string, body?: unknown): Promise<void> {
  try {
    const res = await fetch(`/api${path}`, {
      method,
      credentials: "include",
      headers: body !== undefined ? { "Content-Type": "application/json" } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      recordCloudWriteFailure(`Cloud write failed (HTTP ${res.status}). Your changes remain saved on this device.`);
      console.warn(`[OrgAInise] DB sync ${method} /api${path} → ${res.status} (localStorage preserved)`);
    }
  } catch {
    recordCloudWriteFailure("Cloud write failed because the server could not be reached. Your changes remain saved on this device.");
    console.warn(`[OrgAInise] DB sync ${method} /api${path} failed — offline? (localStorage preserved)`);
  }
}

/* ─── Cloud counts (read-only, no hydration) ─────────────────────── */

export async function fetchCloudCounts(): Promise<{
  ok: boolean; projects: number; memories: number; history: number; error?: string;
}> {
  try {
    const res = await fetch("/api/sync", { credentials: "include" });
    if (res.status === 401) return { ok: false, projects: 0, memories: 0, history: 0, error: "Not signed in" };
    if (!res.ok)            return { ok: false, projects: 0, memories: 0, history: 0, error: `Server error (HTTP ${res.status})` };
    const data = await res.json() as { projects: unknown[]; memories: unknown[]; history: unknown[] };
    return { ok: true, projects: data.projects.length, memories: data.memories.length, history: data.history.length };
  } catch (e) {
    return { ok: false, projects: 0, memories: 0, history: 0, error: e instanceof Error ? e.message : "Network error" };
  }
}

/* ─── Force push (exported) ──────────────────────────────────────── */

export async function forcePushToCloud(userId?: string): Promise<{
  ok: boolean; counts: { projects: number; memories: number; history: number }; error?: string;
}> {
  const projects = Storage.getProjects().filter(p => p.id !== DEMO_PROJECT_ID);
  const memories = Storage.getMemories().filter(m => m.projectId !== DEMO_PROJECT_ID);
  const history  = Storage.getAllHistory().filter(h => h.projectId !== DEMO_PROJECT_ID);

  console.log(
    `[OrgAInise] Force push → user=${userId ?? "?"} ` +
    `local: ${projects.length} projects / ${memories.length} memories / ${history.length} history`,
  );

  try {
    const res = await fetch("/api/sync", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projects, memories, history }),
    });
    if (!res.ok) {
      const error = `HTTP ${res.status}`;
      console.warn(`[OrgAInise] Force push FAILED → ${error}`);
      recordCloudWriteFailure(`Full cloud backup failed (${error}). Your changes remain saved on this device.`);
      _lastSync = { direction: "failed", projects: 0, memories: 0, history: 0, error, userId, timestamp: Date.now() };
      return { ok: false, counts: { projects: 0, memories: 0, history: 0 }, error };
    }
    console.log(`[OrgAInise] Force push OK → ${projects.length} projects saved to cloud`);
    clearCloudWriteFailure();
    markSyncDone();
    _lastSync = { direction: "pushed", projects: projects.length, memories: memories.length, history: history.length, userId, timestamp: Date.now() };
    window.dispatchEvent(new CustomEvent("orgainise:synced", {
      detail: { projects: projects.length, memories: memories.length, history: history.length },
    }));
    return { ok: true, counts: { projects: projects.length, memories: memories.length, history: history.length } };
  } catch (e) {
    const error = e instanceof Error ? e.message : "Network error";
    console.warn("[OrgAInise] Force push FAILED →", error);
    recordCloudWriteFailure(`Full cloud backup failed: ${error}. Your changes remain saved on this device.`);
    _lastSync = { direction: "failed", projects: 0, memories: 0, history: 0, error, userId, timestamp: Date.now() };
    return { ok: false, counts: { projects: 0, memories: 0, history: 0 }, error };
  }
}

/* ─── Force pull (exported) ──────────────────────────────────────── */

export async function forcePullFromCloud(userId?: string): Promise<{
  ok: boolean; counts: { projects: number; memories: number; history: number }; error?: string;
}> {
  console.log(`[OrgAInise] Force pull → user=${userId ?? "?"} — calling GET /api/sync…`);
  try {
    const res = await fetch("/api/sync", { credentials: "include" });
    if (res.status === 401) {
      const error = "Not signed in";
      _lastSync = { direction: "failed", projects: 0, memories: 0, history: 0, error, userId, timestamp: Date.now() };
      return { ok: false, counts: { projects: 0, memories: 0, history: 0 }, error };
    }
    if (!res.ok) {
      const error = `Server error (HTTP ${res.status})`;
      _lastSync = { direction: "failed", projects: 0, memories: 0, history: 0, error, userId, timestamp: Date.now() };
      return { ok: false, counts: { projects: 0, memories: 0, history: 0 }, error };
    }

    const data = await res.json() as { projects: Project[]; memories: MemoryItem[]; history: SessionHistory[] };
    const { projects, memories, history } = data;

    console.log(
      `[OrgAInise] Force pull received → ${projects.length} projects / ${memories.length} memories / ${history.length} history`,
    );

    if (projects.length === 0 && memories.length === 0 && history.length === 0) {
      console.log("[OrgAInise] Force pull — cloud is empty, nothing to restore");
      _lastSync = { direction: "skipped", projects: 0, memories: 0, history: 0, userId, timestamp: Date.now() };
      return { ok: true, counts: { projects: 0, memories: 0, history: 0 } };
    }

    console.log(`[OrgAInise] Hydrating localStorage with ${projects.length} projects…`);
    Storage.hydrate({ projects, memories, history });

    clearCloudWriteFailure();
    _lastSync = { direction: "pulled", projects: projects.length, memories: memories.length, history: history.length, userId, timestamp: Date.now() };

    console.log("[OrgAInise] Hydration complete — dispatching storage-update + orgainise:pulled");
    window.dispatchEvent(new CustomEvent("orgainise:pulled", {
      detail: { projects: projects.length, memories: memories.length, history: history.length },
    }));

    return { ok: true, counts: { projects: projects.length, memories: memories.length, history: history.length } };
  } catch (e) {
    const error = e instanceof Error ? e.message : "Network error";
    console.warn("[OrgAInise] Force pull FAILED →", error);
    _lastSync = { direction: "failed", projects: 0, memories: 0, history: 0, error, userId, timestamp: Date.now() };
    return { ok: false, counts: { projects: 0, memories: 0, history: 0 }, error };
  }
}

/* ─── useSyncedStorage ───────────────────────────────────────────── */

export function useSyncedStorage() {
  const base            = useStorage();
  const { user, isAuthenticated } = useAuth();

  // useRef prevents double-firing even if the effect dependency changes twice quickly
  const syncFiredRef = useRef(false);

  useEffect(() => {
    // Race-condition fix: wait until user.id is confirmed present, not just isAuthenticated
    if (!isAuthenticated || !user?.id) return;
    if (syncFiredRef.current) return;
    syncFiredRef.current = true;

    const userId    = user.id;
    const userLabel = `user=${userId}${user.email ? ` <${user.email}>` : ""}`;
    const local     = getLocalCounts();

    console.log(
      `[OrgAInise] ── Sign-in detected (${userLabel}) ──`,
      `\n  localStorage: ${local.projects} projects / ${local.memories} memories / ${local.history} history`,
    );

    if (local.projects === 0 && local.memories === 0 && local.history === 0) {
      // ── New device or cleared storage: pull from cloud ────────────
      console.log("[OrgAInise] Local storage empty → PULLING from cloud…");
      void forcePullFromCloud(userId).then((result) => {
        if (!result.ok) {
          console.warn(`[OrgAInise] Auto-pull failed: ${result.error}`);
        } else if (result.counts.projects === 0) {
          console.log("[OrgAInise] Auto-pull: cloud is also empty — first-time user on this account");
        } else {
          console.log(`[OrgAInise] Auto-pull complete → ${result.counts.projects} projects restored`);
          markSyncDone();
        }
      });
    } else {
      // Bulk push cannot distinguish stale local data from newer cloud data yet.
      // Preserve both copies until conflict-aware merging is available.
      const reason = "Automatic cloud backup paused to prevent overwriting newer data from another device.";
      console.warn(`[OrgAInise] ${reason}`);
      clearSyncDone();
      _lastSync = {
        direction: "paused",
        projects: local.projects,
        memories: local.memories,
        history: local.history,
        error: reason,
        userId,
        timestamp: Date.now(),
      };
      window.dispatchEvent(new CustomEvent("orgainise:sync-paused", {
        detail: { reason },
      }));
    }
  }, [isAuthenticated, user?.id]);

  /* Synced write methods — localStorage first, background API call second */
  const syncedStorage = {
    ...Storage,

    saveProject(project: Project) {
      Storage.saveProject(project);
      if (isAuthenticated) void apiFetch("POST", "/projects", project);
    },

    deleteProject(id: string) {
      Storage.deleteProject(id);
      if (isAuthenticated) void apiFetch("DELETE", `/projects/${id}`);
    },

    duplicateProject(id: string): Project | null {
      const copy = Storage.duplicateProject(id);
      if (copy && isAuthenticated) void apiFetch("POST", "/projects", copy);
      return copy;
    },

    saveMemory(memory: MemoryItem) {
      Storage.saveMemory(memory);
      if (isAuthenticated) void apiFetch("PUT", `/memories/${memory.id}`, memory);
    },

    deleteMemory(id: string) {
      Storage.deleteMemory(id);
      if (isAuthenticated) void apiFetch("DELETE", `/memories/${id}`);
    },

    saveHistory(history: SessionHistory) {
      Storage.saveHistory(history);
      if (isAuthenticated) void apiFetch("POST", `/projects/${history.projectId}/history`, history);
    },
  };

  return { stamp: base.stamp, Storage: syncedStorage };
}
