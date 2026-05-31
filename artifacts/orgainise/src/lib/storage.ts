import { useState, useEffect } from 'react';

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
  conflictNote: string | null;
};

export type SessionHistory = {
  id: string;
  projectId: string;
  rawNotes: string;
  suggestions: AiSuggestion[];
  approvedCount: number;
  createdAt: string;
};

const STORAGE_KEYS = {
  PROJECTS: 'orgainise_projects',
  MEMORIES: 'orgainise_memories',
  HISTORY: 'orgainise_history',
};

// Generic read/write
function readData<T>(key: string, defaultValue: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : defaultValue;
  } catch {
    return defaultValue;
  }
}

function writeData<T>(key: string, data: T) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
    window.dispatchEvent(new Event('storage-update'));
  } catch (e) {
    console.error("Failed to write to localStorage", e);
  }
}

export const Storage = {
  getProjects: () => readData<Project[]>(STORAGE_KEYS.PROJECTS, []),
  getProject: (id: string) => readData<Project[]>(STORAGE_KEYS.PROJECTS, []).find(p => p.id === id),
  saveProject: (project: Project) => {
    const projects = readData<Project[]>(STORAGE_KEYS.PROJECTS, []);
    const existingIndex = projects.findIndex(p => p.id === project.id);
    if (existingIndex >= 0) {
      projects[existingIndex] = project;
    } else {
      projects.push(project);
    }
    writeData(STORAGE_KEYS.PROJECTS, projects);
  },
  deleteProject: (id: string) => {
    const projects = readData<Project[]>(STORAGE_KEYS.PROJECTS, []).filter(p => p.id !== id);
    writeData(STORAGE_KEYS.PROJECTS, projects);
    
    // Also delete associated memories and history
    const memories = readData<MemoryItem[]>(STORAGE_KEYS.MEMORIES, []).filter(m => m.projectId !== id);
    writeData(STORAGE_KEYS.MEMORIES, memories);
    
    const history = readData<SessionHistory[]>(STORAGE_KEYS.HISTORY, []).filter(h => h.projectId !== id);
    writeData(STORAGE_KEYS.HISTORY, history);
  },

  getMemories: (projectId?: string) => {
    const memories = readData<MemoryItem[]>(STORAGE_KEYS.MEMORIES, []);
    return projectId ? memories.filter(m => m.projectId === projectId) : memories;
  },
  saveMemory: (memory: MemoryItem) => {
    const memories = readData<MemoryItem[]>(STORAGE_KEYS.MEMORIES, []);
    const existingIndex = memories.findIndex(m => m.id === memory.id);
    if (existingIndex >= 0) {
      memories[existingIndex] = memory;
    } else {
      memories.push(memory);
    }
    writeData(STORAGE_KEYS.MEMORIES, memories);
  },
  deleteMemory: (id: string) => {
    const memories = readData<MemoryItem[]>(STORAGE_KEYS.MEMORIES, []).filter(m => m.id !== id);
    writeData(STORAGE_KEYS.MEMORIES, memories);
  },

  getHistory: (projectId: string) => {
    return readData<SessionHistory[]>(STORAGE_KEYS.HISTORY, [])
      .filter(h => h.projectId === projectId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },
  saveHistory: (history: SessionHistory) => {
    let allHistory = readData<SessionHistory[]>(STORAGE_KEYS.HISTORY, []);
    allHistory.push(history);
    
    // Keep only last 10 per project
    const projectHistory = allHistory
      .filter(h => h.projectId === history.projectId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 10);
      
    allHistory = allHistory.filter(h => h.projectId !== history.projectId).concat(projectHistory);
    writeData(STORAGE_KEYS.HISTORY, allHistory);
  }
};

export function useStorage() {
  const [stamp, setStamp] = useState(0);
  
  useEffect(() => {
    const handler = () => setStamp(s => s + 1);
    window.addEventListener('storage-update', handler);
    return () => window.removeEventListener('storage-update', handler);
  }, []);
  
  return { stamp, Storage };
}

export function generateId() {
  return Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
}
