import { useState, useEffect } from 'react';

/* ─── Types ──────────────────────────────────────────────────────── */
export type ImportanceLevel = 'must-include' | 'useful-context' | 'archive-reference';

export type Project = {
  id: string;
  name: string;
  type: string;
  categories: string[];
  createdAt: string;
  updatedAt: string;
};

export type MemoryItem = {
  id: string;
  projectId: string;
  text: string;
  category: string;
  importanceLevel: ImportanceLevel;
  createdAt: string;
  updatedAt: string;
};

export type AiSuggestion = {
  suggestedText: string;
  category: string;
  importanceLevel: ImportanceLevel;
  reason: string;
  conflictNote: string | null | undefined;
};

export type SessionHistory = {
  id: string;
  projectId: string;
  rawNotes: string;
  suggestions: AiSuggestion[];
  approvedCount: number;
  createdAt: string;
};

export type RevisionSnapshot = {
  id: string;
  projectId: string;
  label: string;
  createdAt: string;
  memoriesSnapshot: MemoryItem[];
};

/* ─── Keys ───────────────────────────────────────────────────────── */
const STORAGE_KEYS = {
  PROJECTS:  'orgainise_projects',
  MEMORIES:  'orgainise_memories',
  HISTORY:   'orgainise_history',
  SNAPSHOTS: 'orgainise_snapshots',
} as const;

/* ─── Storage health check ───────────────────────────────────────── */
export function checkStorageHealth(): { ok: boolean; error?: string } {
  try {
    const k = '__orgainise_health_chk__';
    localStorage.setItem(k, '✓');
    const v = localStorage.getItem(k);
    localStorage.removeItem(k);
    if (v !== '✓') return { ok: false, error: 'Read-back mismatch — localStorage may be unreliable.' };
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error
        ? `localStorage unavailable: ${e.message}`
        : 'localStorage is blocked or unavailable in this context.',
    };
  }
}

/* ─── Low-level I/O ──────────────────────────────────────────────── */
function readData<T>(key: string, defaultValue: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return defaultValue;
    return JSON.parse(raw) as T;
  } catch {
    // Don't wipe data on parse error — return the default so the app
    // stays usable, but don't silently overwrite corrupt data.
    return defaultValue;
  }
}

function writeData<T>(key: string, data: T): void {
  const count = Array.isArray(data) ? `${(data as unknown[]).length} item(s)` : '1 object';
  console.log(`[OrgAInise] localStorage.setItem key="${key}" (${count})`);
  window.dispatchEvent(new CustomEvent('orgainise:write', { detail: { phase: 'start' } }));
  try {
    localStorage.setItem(key, JSON.stringify(data));
    console.log(`[OrgAInise] localStorage.setItem key="${key}" — SUCCESS`);
    window.dispatchEvent(new CustomEvent('orgainise:write', {
      detail: { phase: 'success', timestamp: Date.now() },
    }));
    window.dispatchEvent(new Event('storage-update'));
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown localStorage error';
    console.error(`[OrgAInise] localStorage.setItem key="${key}" — FAILED:`, msg, e);
    window.dispatchEvent(new CustomEvent('orgainise:write', {
      detail: { phase: 'error', message: msg },
    }));
  }
}

/* ─── Manual "save all" (re-writes every key) ────────────────────── */
export function saveAll(): { ok: boolean; error?: string } {
  try {
    const projects = readData<Project[]>(STORAGE_KEYS.PROJECTS, []);
    const memories = readData<MemoryItem[]>(STORAGE_KEYS.MEMORIES, []);
    const history  = readData<SessionHistory[]>(STORAGE_KEYS.HISTORY, []);

    localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(projects));
    localStorage.setItem(STORAGE_KEYS.MEMORIES, JSON.stringify(memories));
    localStorage.setItem(STORAGE_KEYS.HISTORY,  JSON.stringify(history));

    window.dispatchEvent(new CustomEvent('orgainise:write', {
      detail: { phase: 'success', timestamp: Date.now() },
    }));
    window.dispatchEvent(new Event('storage-update'));
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Save failed';
    window.dispatchEvent(new CustomEvent('orgainise:write', {
      detail: { phase: 'error', message: msg },
    }));
    return { ok: false, error: msg };
  }
}

/* ─── Storage API ────────────────────────────────────────────────── */
export const Storage = {
  /* Projects */
  getProjects: (): Project[] =>
    readData<Project[]>(STORAGE_KEYS.PROJECTS, []),

  getProject: (id: string): Project | undefined =>
    readData<Project[]>(STORAGE_KEYS.PROJECTS, []).find(p => p.id === id),

  saveProject: (project: Project): void => {
    const projects = readData<Project[]>(STORAGE_KEYS.PROJECTS, []);
    const idx = projects.findIndex(p => p.id === project.id);
    if (idx >= 0) projects[idx] = project; else projects.push(project);
    console.log(`[OrgAInise] saveProject id="${project.id}" name="${project.name}" → writing ${projects.length} project(s) to key="${STORAGE_KEYS.PROJECTS}"`);
    writeData(STORAGE_KEYS.PROJECTS, projects);
  },

  duplicateProject: (id: string): Project | null => {
    const projects = readData<Project[]>(STORAGE_KEYS.PROJECTS, []);
    const source = projects.find(p => p.id === id);
    if (!source) return null;
    const now = new Date().toISOString();
    const copy: Project = {
      ...source,
      id: generateId(),
      name: `Copy of ${source.name}`,
      createdAt: now,
      updatedAt: now,
    };
    projects.push(copy);
    writeData(STORAGE_KEYS.PROJECTS, projects);
    return copy;
  },

  deleteProject: (id: string): void => {
    writeData(STORAGE_KEYS.PROJECTS,
      readData<Project[]>(STORAGE_KEYS.PROJECTS, []).filter(p => p.id !== id));
    writeData(STORAGE_KEYS.MEMORIES,
      readData<MemoryItem[]>(STORAGE_KEYS.MEMORIES, []).filter(m => m.projectId !== id));
    writeData(STORAGE_KEYS.HISTORY,
      readData<SessionHistory[]>(STORAGE_KEYS.HISTORY, []).filter(h => h.projectId !== id));
  },

  /* Memories */
  getMemories: (projectId?: string): MemoryItem[] => {
    const all = readData<MemoryItem[]>(STORAGE_KEYS.MEMORIES, []);
    return projectId ? all.filter(m => m.projectId === projectId) : all;
  },

  saveMemory: (memory: MemoryItem): void => {
    const memories = readData<MemoryItem[]>(STORAGE_KEYS.MEMORIES, []);
    const idx = memories.findIndex(m => m.id === memory.id);
    if (idx >= 0) memories[idx] = memory; else memories.push(memory);
    writeData(STORAGE_KEYS.MEMORIES, memories);
  },

  deleteMemory: (id: string): void => {
    writeData(STORAGE_KEYS.MEMORIES,
      readData<MemoryItem[]>(STORAGE_KEYS.MEMORIES, []).filter(m => m.id !== id));
  },

  /* History */
  getAllHistory: (): SessionHistory[] =>
    readData<SessionHistory[]>(STORAGE_KEYS.HISTORY, []),

  getHistory: (projectId: string): SessionHistory[] =>
    readData<SessionHistory[]>(STORAGE_KEYS.HISTORY, [])
      .filter(h => h.projectId === projectId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),

  /* Revision snapshots */
  getSnapshots: (projectId: string): RevisionSnapshot[] =>
    readData<RevisionSnapshot[]>(STORAGE_KEYS.SNAPSHOTS, [])
      .filter(s => s.projectId === projectId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),

  saveSnapshot: (snapshot: RevisionSnapshot): void => {
    let all = readData<RevisionSnapshot[]>(STORAGE_KEYS.SNAPSHOTS, []);
    all.push(snapshot);
    const forProject = all
      .filter(s => s.projectId === snapshot.projectId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5);
    all = all.filter(s => s.projectId !== snapshot.projectId).concat(forProject);
    writeData(STORAGE_KEYS.SNAPSHOTS, all);
  },

  restoreSnapshot: (snapshotId: string, projectId: string): boolean => {
    const all = readData<RevisionSnapshot[]>(STORAGE_KEYS.SNAPSHOTS, []);
    const snapshot = all.find(s => s.id === snapshotId && s.projectId === projectId);
    if (!snapshot) return false;
    const allMemories = readData<MemoryItem[]>(STORAGE_KEYS.MEMORIES, []);
    const otherMemories = allMemories.filter(m => m.projectId !== projectId);
    writeData(STORAGE_KEYS.MEMORIES, [...otherMemories, ...snapshot.memoriesSnapshot]);
    window.dispatchEvent(new Event('storage-update'));
    return true;
  },

  saveHistory: (history: SessionHistory): void => {
    let all = readData<SessionHistory[]>(STORAGE_KEYS.HISTORY, []);
    all.push(history);
    // Cap at 10 entries per project
    const capped = all
      .filter(h => h.projectId === history.projectId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 10);
    all = all.filter(h => h.projectId !== history.projectId).concat(capped);
    writeData(STORAGE_KEYS.HISTORY, all);
  },
};

/* ─── useStorage hook ────────────────────────────────────────────── */
export function useStorage() {
  const [stamp, setStamp] = useState(0);

  useEffect(() => {
    const handler = () => setStamp(s => s + 1);
    window.addEventListener('storage-update', handler);
    return () => window.removeEventListener('storage-update', handler);
  }, []);

  return { stamp, Storage };
}

/* ─── Helpers ────────────────────────────────────────────────────── */
export function generateId(): string {
  return Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
}
