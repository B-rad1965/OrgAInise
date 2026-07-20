/**
 * Dual-write layer — localStorage remains the source of truth at runtime.
 *
 * On sign-in the hook checks whether localStorage has any real (non-demo) projects:
 *   • Empty (new device)  → PULL from GET /api/sync → hydrate localStorage → UI re-renders.
 *   • Has local data      → PAUSE automatic sync to avoid overwriting newer cloud data.
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

async function responseError(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json() as { error?: unknown };
    return typeof data.error === "string" && data.error.trim() ? data.error : fallback;
  } catch {
    return fallback;
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

async function apiFetch(method: string, path: string, body?: unknown, expectedUpdatedAt?: string): Promise<void> {
  try {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (expectedUpdatedAt) headers["X-Orgainise-Updated-At"] = expectedUpdatedAt;
    const res = await fetch(`/api${path}`, {
      method,
      credentials: "include",
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const detail = await responseError(res, `HTTP ${res.status}`);
      recordCloudWriteFailure(`Cloud write failed: ${detail}. Your changes remain saved on this device.`);
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
      const error = await responseError(res, `HTTP ${res.status}`);
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

type VersionedRecord = { id: string; updatedAt: string };

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).filter(key => record[key] !== undefined).sort().map(key =>
      `${JSON.stringify(key)}:${canonicalJson(record[key])}`,
    ).join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

function mergeVersioned<T extends VersionedRecord>(
  local: T[],
  cloud: T[],
): { items: T[]; localUnbacked: number; conflicts: string[] } {
  const merged = new Map(cloud.map(item => [item.id, item]));
  const localUnbackedIds = new Set<string>();
  const conflicts: string[] = [];

  for (const localItem of local) {
    const cloudItem = merged.get(localItem.id);
    if (!cloudItem) {
      merged.set(localItem.id, localItem);
      localUnbackedIds.add(localItem.id);
      continue;
    }

    const localTime = Date.parse(localItem.updatedAt);
    const cloudTime = Date.parse(cloudItem.updatedAt);
    if (!Number.isFinite(localTime) || !Number.isFinite(cloudTime)) {
      conflicts.push(localItem.id);
    } else if (localTime > cloudTime) {
      merged.set(localItem.id, localItem);
      localUnbackedIds.add(localItem.id);
    } else if (localTime === cloudTime && canonicalJson(localItem) !== canonicalJson(cloudItem)) {
      conflicts.push(localItem.id);
    }
  }

  return { items: [...merged.values()], localUnbacked: localUnbackedIds.size, conflicts };
}

function mergeHistory(
  local: SessionHistory[],
  cloud: SessionHistory[],
): { items: SessionHistory[]; localUnbacked: number; conflicts: string[] } {
  const merged = new Map(cloud.map(item => [item.id, item]));
  let localUnbacked = 0;
  const conflicts: string[] = [];

  for (const localItem of local) {
    const cloudItem = merged.get(localItem.id);
    if (!cloudItem) {
      merged.set(localItem.id, localItem);
      localUnbacked += 1;
    } else if (canonicalJson(localItem) !== canonicalJson(cloudItem)) {
      conflicts.push(localItem.id);
    }
  }

  return { items: [...merged.values()], localUnbacked, conflicts };
}

export async function forcePullFromCloud(userId?: string): Promise<{
  ok: boolean;
  counts: { projects: number; memories: number; history: number };
  preservedLocal?: number;
  error?: string;
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

    const localProjects = Storage.getProjects().filter(project => project.id !== DEMO_PROJECT_ID);
    const localMemories = Storage.getMemories().filter(memory => memory.projectId !== DEMO_PROJECT_ID);
    const localHistory = Storage.getAllHistory().filter(entry => entry.projectId !== DEMO_PROJECT_ID);
    const demoProjects = Storage.getProjects().filter(project => project.id === DEMO_PROJECT_ID);
    const demoMemories = Storage.getMemories().filter(memory => memory.projectId === DEMO_PROJECT_ID);
    const demoHistory = Storage.getAllHistory().filter(entry => entry.projectId === DEMO_PROJECT_ID);

    const projectMerge = mergeVersioned(localProjects, projects);
    const memoryMerge = mergeVersioned(localMemories, memories);
    const historyMerge = mergeHistory(localHistory, history);
    const conflictCount = projectMerge.conflicts.length
      + memoryMerge.conflicts.length
      + historyMerge.conflicts.length;

    if (conflictCount > 0) {
      const error = `Pull stopped before changing this device because ${conflictCount} record conflict${conflictCount === 1 ? "" : "s"} require review.`;
      _lastSync = { direction: "failed", projects: 0, memories: 0, history: 0, error, userId, timestamp: Date.now() };
      return { ok: false, counts: { projects: 0, memories: 0, history: 0 }, error };
    }

    const preservedLocal = projectMerge.localUnbacked
      + memoryMerge.localUnbacked
      + historyMerge.localUnbacked;
    console.log(`[OrgAInise] Hydrating merged storage with ${projectMerge.items.length} projects…`);
    const hydrated = Storage.hydrate({
      projects: [...demoProjects, ...projectMerge.items],
      memories: [...demoMemories, ...memoryMerge.items],
      history: [...demoHistory, ...historyMerge.items],
    });
    if (!hydrated.ok) {
      const error = hydrated.error ?? "Cloud data could not be saved on this device.";
      _lastSync = { direction: "failed", projects: 0, memories: 0, history: 0, error, userId, timestamp: Date.now() };
      return { ok: false, counts: { projects: 0, memories: 0, history: 0 }, error };
    }

    if (preservedLocal > 0) {
      const reason = `${preservedLocal} newer or local-only record${preservedLocal === 1 ? " was" : "s were"} preserved and still need cloud backup.`;
      clearSyncDone();
      _lastSync = {
        direction: "paused",
        projects: projectMerge.items.length,
        memories: memoryMerge.items.length,
        history: historyMerge.items.length,
        error: reason,
        userId,
        timestamp: Date.now(),
      };
      window.dispatchEvent(new CustomEvent("orgainise:sync-paused", { detail: { reason } }));
    } else {
      clearCloudWriteFailure();
      markSyncDone();
      _lastSync = { direction: "pulled", projects: projects.length, memories: memories.length, history: history.length, userId, timestamp: Date.now() };
      window.dispatchEvent(new CustomEvent("orgainise:pulled", {
        detail: { projects: projects.length, memories: memories.length, history: history.length },
      }));
    }

    return {
      ok: true,
      counts: { projects: projects.length, memories: memories.length, history: history.length },
      preservedLocal,
    };
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
      // Keep automatic bulk sync paused so any cross-device reconciliation remains explicit.
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
      const expectedUpdatedAt = Storage.getProject(project.id)?.updatedAt;
      Storage.saveProject(project);
      if (isAuthenticated) void apiFetch("POST", "/projects", project, expectedUpdatedAt);
    },

    deleteProject(id: string) {
      const expectedUpdatedAt = Storage.getProject(id)?.updatedAt;
      Storage.deleteProject(id);
      if (isAuthenticated) void apiFetch("DELETE", `/projects/${id}`, undefined, expectedUpdatedAt);
    },

    duplicateProject(id: string): Project | null {
      const copy = Storage.duplicateProject(id);
      if (copy && isAuthenticated) void apiFetch("POST", "/projects", copy);
      return copy;
    },

    saveMemory(memory: MemoryItem) {
      const expectedUpdatedAt = Storage.getMemories().find(item => item.id === memory.id)?.updatedAt;
      Storage.saveMemory(memory);
      if (isAuthenticated) void apiFetch("PUT", `/memories/${memory.id}`, memory, expectedUpdatedAt);
    },

    deleteMemory(id: string) {
      const expectedUpdatedAt = Storage.getMemories().find(memory => memory.id === id)?.updatedAt;
      Storage.deleteMemory(id);
      if (isAuthenticated) void apiFetch("DELETE", `/memories/${id}`, undefined, expectedUpdatedAt);
    },

    saveHistory(history: SessionHistory) {
      Storage.saveHistory(history);
      if (isAuthenticated) void apiFetch("POST", `/projects/${history.projectId}/history`, history);
    },
  };

  return { stamp: base.stamp, Storage: syncedStorage };
}
