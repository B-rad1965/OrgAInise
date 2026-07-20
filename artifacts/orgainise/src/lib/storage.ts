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

export type BackupData = {
  version: 1 | 2;
  exportedAt: string;
  projects: Project[];
  memories: MemoryItem[];
  history: SessionHistory[];
  snapshots: RevisionSnapshot[];
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
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidDate(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function hasUniqueIds(items: Array<{ id: string }>): boolean {
  return new Set(items.map(item => item.id)).size === items.length;
}

function isProject(value: unknown): value is Project {
  return isRecord(value)
    && typeof value.id === 'string'
    && value.id !== '__demo__'
    && typeof value.name === 'string'
    && typeof value.type === 'string'
    && Array.isArray(value.categories)
    && value.categories.every(category => typeof category === 'string')
    && isValidDate(value.createdAt)
    && isValidDate(value.updatedAt);
}

function isMemory(value: unknown): value is MemoryItem {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.projectId === 'string'
    && typeof value.text === 'string'
    && typeof value.category === 'string'
    && ['must-include', 'useful-context', 'archive-reference'].includes(String(value.importanceLevel))
    && isValidDate(value.createdAt)
    && isValidDate(value.updatedAt);
}

function isHistory(value: unknown): value is SessionHistory {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.projectId === 'string'
    && typeof value.rawNotes === 'string'
    && Array.isArray(value.suggestions)
    && value.suggestions.every(suggestion =>
      isRecord(suggestion)
      && typeof suggestion.suggestedText === 'string'
      && typeof suggestion.category === 'string'
      && ['must-include', 'useful-context', 'archive-reference'].includes(String(suggestion.importanceLevel))
      && typeof suggestion.reason === 'string'
      && (suggestion.conflictNote === null || suggestion.conflictNote === undefined || typeof suggestion.conflictNote === 'string')
    )
    && typeof value.approvedCount === 'number'
    && Number.isInteger(value.approvedCount)
    && value.approvedCount >= 0
    && isValidDate(value.createdAt);
}

function isSnapshot(value: unknown): value is RevisionSnapshot {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.projectId === 'string'
    && typeof value.label === 'string'
    && isValidDate(value.createdAt)
    && Array.isArray(value.memoriesSnapshot)
    && value.memoriesSnapshot.every(isMemory);
}

export function parseBackup(value: unknown): { ok: true; data: BackupData } | { ok: false; error: string } {
  if (!isRecord(value) || (value.version !== 1 && value.version !== 2)) {
    return { ok: false, error: 'This is not a supported OrgAInise backup (expected version 1 or 2).' };
  }

  const snapshots = value.version === 1 && value.snapshots === undefined ? [] : value.snapshots;
  if (!isValidDate(value.exportedAt)
    || !Array.isArray(value.projects) || !value.projects.every(isProject)
    || !Array.isArray(value.memories) || !value.memories.every(isMemory)
    || !Array.isArray(value.history) || !value.history.every(isHistory)
    || !Array.isArray(snapshots) || !snapshots.every(isSnapshot)) {
    return { ok: false, error: 'The backup contains missing or invalid data.' };
  }

  if (!hasUniqueIds(value.projects) || !hasUniqueIds(value.memories)
    || !hasUniqueIds(value.history) || !hasUniqueIds(snapshots)) {
    return { ok: false, error: 'The backup contains duplicate record IDs.' };
  }

  const projectIds = new Set(value.projects.map(project => project.id));
  const hasOrphan = [...value.memories, ...value.history, ...snapshots]
    .some(item => !projectIds.has(item.projectId));
  const hasInvalidSnapshotMemory = snapshots.some(snapshot =>
    !hasUniqueIds(snapshot.memoriesSnapshot)
    || snapshot.memoriesSnapshot.some(memory => memory.projectId !== snapshot.projectId),
  );
  if (hasOrphan || hasInvalidSnapshotMemory) {
    return { ok: false, error: 'The backup contains records that do not belong to a valid project.' };
  }

  return {
    ok: true,
    data: {
      version: value.version,
      exportedAt: value.exportedAt,
      projects: value.projects,
      memories: value.memories,
      history: value.history,
      snapshots,
    },
  };
}

export function saveAll(): { ok: boolean; error?: string } {
  try {
    const projects = readData<Project[]>(STORAGE_KEYS.PROJECTS, []);
    const memories = readData<MemoryItem[]>(STORAGE_KEYS.MEMORIES, []);
    const history  = readData<SessionHistory[]>(STORAGE_KEYS.HISTORY, []);
    const snapshots = readData<RevisionSnapshot[]>(STORAGE_KEYS.SNAPSHOTS, []);

    localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(projects));
    localStorage.setItem(STORAGE_KEYS.MEMORIES, JSON.stringify(memories));
    localStorage.setItem(STORAGE_KEYS.HISTORY,  JSON.stringify(history));
    localStorage.setItem(STORAGE_KEYS.SNAPSHOTS, JSON.stringify(snapshots));

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
  restoreBackup: (backup: BackupData): { ok: boolean; error?: string } => {
    const keys = Object.values(STORAGE_KEYS);
    const previous = new Map<string, string | null>();

    try {
      for (const key of keys) previous.set(key, localStorage.getItem(key));
      const demoProjects = readData<Project[]>(STORAGE_KEYS.PROJECTS, []).filter(p => p.id === '__demo__');
      const demoMemories = readData<MemoryItem[]>(STORAGE_KEYS.MEMORIES, []).filter(m => m.projectId === '__demo__');
      const demoHistory = readData<SessionHistory[]>(STORAGE_KEYS.HISTORY, []).filter(h => h.projectId === '__demo__');
      const restored = new Map<string, string>([
        [STORAGE_KEYS.PROJECTS, JSON.stringify([...demoProjects, ...backup.projects])],
        [STORAGE_KEYS.MEMORIES, JSON.stringify([...demoMemories, ...backup.memories])],
        [STORAGE_KEYS.HISTORY, JSON.stringify([...demoHistory, ...backup.history])],
        [STORAGE_KEYS.SNAPSHOTS, JSON.stringify(backup.snapshots)],
      ]);

      for (const [key, serialized] of restored) localStorage.setItem(key, serialized);
      if ([...restored].some(([key, serialized]) => localStorage.getItem(key) !== serialized)) {
        throw new Error('Browser storage failed the restore read-back check.');
      }
    } catch (error) {
      try {
        for (const [key, oldValue] of previous) {
          if (oldValue === null) localStorage.removeItem(key);
          else localStorage.setItem(key, oldValue);
        }
      } catch {
        return { ok: false, error: 'Restore failed and browser storage could not be rolled back completely.' };
      }
      return { ok: false, error: error instanceof Error ? error.message : 'Could not write the backup to browser storage.' };
    }

    window.dispatchEvent(new CustomEvent('orgainise:write', {
      detail: { phase: 'success', timestamp: Date.now() },
    }));
    window.dispatchEvent(new Event('storage-update'));
    return { ok: true };
  },

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
    writeData(STORAGE_KEYS.SNAPSHOTS,
      readData<RevisionSnapshot[]>(STORAGE_KEYS.SNAPSHOTS, []).filter(s => s.projectId !== id));
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
  getAllSnapshots: (): RevisionSnapshot[] =>
    readData<RevisionSnapshot[]>(STORAGE_KEYS.SNAPSHOTS, []),

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

  /**
   * Batch-write all three collections to localStorage in one shot,
   * then dispatch a single storage-update so the UI re-renders once.
   * Used by the new-device pull flow in synced-storage.ts.
   */
  hydrate: (data: { projects: Project[]; memories: MemoryItem[]; history: SessionHistory[] }): void => {
    try {
      localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(data.projects));
      localStorage.setItem(STORAGE_KEYS.MEMORIES, JSON.stringify(data.memories));
      localStorage.setItem(STORAGE_KEYS.HISTORY,  JSON.stringify(data.history));
    } catch (e) {
      console.error('[OrgAInise] hydrate failed:', e instanceof Error ? e.message : e);
    }
    window.dispatchEvent(new Event('storage-update'));
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
