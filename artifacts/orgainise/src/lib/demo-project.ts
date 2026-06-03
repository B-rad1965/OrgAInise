import type { Project, MemoryItem, SessionHistory } from "./storage";
import { Storage } from "./storage";

export const DEMO_PROJECT_ID = "__demo__";

const D = "2024-01-01T00:00:00.000Z";

const DEMO_PROJECT: Project = {
  id: DEMO_PROJECT_ID,
  name: "The Shattered Kingdom",
  type: "Writing / Worldbuilding",
  categories: ["Characters", "Worldbuilding", "Story DNA", "Plot Threads", "Canon"],
  createdAt: D,
  updatedAt: D,
};

const DEMO_MEMORIES: MemoryItem[] = [
  {
    id: "demo_m1", projectId: DEMO_PROJECT_ID, category: "Characters",
    importanceLevel: "must-include",
    text: "Kael Ardyn — former soldier turned reluctant revolutionary. Lost his entire unit at the Battle of Veld Crossing and has never forgiven himself. Uses sarcasm as armour. Deeply principled but hates being told so.",
    createdAt: D, updatedAt: D,
  },
  {
    id: "demo_m2", projectId: DEMO_PROJECT_ID, category: "Characters",
    importanceLevel: "must-include",
    text: "Syr Thessaly — royal archivist who discovered the Shattering was engineered, not natural. She has been quietly suppressing that knowledge for years. Kael doesn't fully trust her, but she's the only one who knows where the Resonance Engine blueprints are hidden.",
    createdAt: D, updatedAt: D,
  },
  {
    id: "demo_m3", projectId: DEMO_PROJECT_ID, category: "Characters",
    importanceLevel: "useful-context",
    text: "The Hollow King — antagonist. He doesn't want power or conquest. He wants the world to forget the Shattering ever happened. Believes collective amnesia is the only path to lasting peace. That's what makes him genuinely dangerous.",
    createdAt: D, updatedAt: D,
  },
  {
    id: "demo_m4", projectId: DEMO_PROJECT_ID, category: "Worldbuilding",
    importanceLevel: "must-include",
    text: "The Shattering (300 years ago): the continent didn't break by accident. Someone used the Resonance Engines to deliberately fracture the landmass and end the Unification Wars. The official history calls it a geological catastrophe. Almost everyone believes that.",
    createdAt: D, updatedAt: D,
  },
  {
    id: "demo_m5", projectId: DEMO_PROJECT_ID, category: "Worldbuilding",
    importanceLevel: "must-include",
    text: "The Five Shards: what remains of the original continent. Each Shard developed its own culture, technology, and interpretation of the Shattering. Shard Three (Velmuun) is the most technologically advanced and the most politically fractured.",
    createdAt: D, updatedAt: D,
  },
  {
    id: "demo_m6", projectId: DEMO_PROJECT_ID, category: "Worldbuilding",
    importanceLevel: "must-include",
    text: "Resonance Engines: ancient machines that vibrate at the harmonic frequency of stone. Still active beneath each Shard — they're the only reason the fragments haven't sunk. The Hollow King intends to silence them permanently, believing this will stabilise the world. It won't.",
    createdAt: D, updatedAt: D,
  },
  {
    id: "demo_m7", projectId: DEMO_PROJECT_ID, category: "Story DNA",
    importanceLevel: "must-include",
    text: "Core theme: \"History is always written by those who control memory.\" The Shattering is the wound the world doesn't know it has. The story is about what happens when the truth becomes survivable — and who decides that it is.",
    createdAt: D, updatedAt: D,
  },
  {
    id: "demo_m8", projectId: DEMO_PROJECT_ID, category: "Story DNA",
    importanceLevel: "must-include",
    text: "Emotional engine: Kael and Syr are both running from complicity. He from a command decision that killed his unit. She from decades of actively burying the truth. Their partnership forces them to stop running — and to decide what they owe the world.",
    createdAt: D, updatedAt: D,
  },
  {
    id: "demo_m9", projectId: DEMO_PROJECT_ID, category: "Story DNA",
    importanceLevel: "useful-context",
    text: "Tone: low-magic, grounded, politically complex. Closer to Abercrombie than Tolkien. Magic exists but it's engineering, not mysticism. The Resonance Engines are technology people no longer understand.",
    createdAt: D, updatedAt: D,
  },
  {
    id: "demo_m10", projectId: DEMO_PROJECT_ID, category: "Plot Threads",
    importanceLevel: "must-include",
    text: "Current status: Kael and Syr have reached Velmuun (Shard Three) with a fragment of an original Resonance Engine blueprint. The Hollow King's agents — the Silencers — are approximately two days behind them.",
    createdAt: D, updatedAt: D,
  },
  {
    id: "demo_m11", projectId: DEMO_PROJECT_ID, category: "Plot Threads",
    importanceLevel: "must-include",
    text: "Syr's secret: she worked for the Archivists' Council for eleven years — the organisation that has been suppressing knowledge of the engineered Shattering. She wasn't just aware of the cover-up. She contributed to it. Kael doesn't know yet.",
    createdAt: D, updatedAt: D,
  },
  {
    id: "demo_m12", projectId: DEMO_PROJECT_ID, category: "Canon",
    importanceLevel: "useful-context",
    text: "The Unification Wars ended the same year as the Shattering — this is not a coincidence. The original architect of the Shattering was the last Unified Emperor, who chose to destroy the continent rather than lose the war.",
    createdAt: D, updatedAt: D,
  },
];

const DEMO_HISTORY: SessionHistory[] = [
  {
    id: "demo_h1",
    projectId: DEMO_PROJECT_ID,
    rawNotes:
      "Wrote the scene where Kael and Syr first arrive in Velmuun. Decided that Syr knows the city well — she was stationed here during her Archivists' Council years, which she hasn't told Kael. She's navigating by memory and pretending it's just good map-reading. Kael is suspicious but doesn't push it yet.",
    suggestions: [
      {
        suggestedText: "Syr spent time in Velmuun during her Archivists' Council years. She knows the city well but is hiding this from Kael — navigating by memory, passing it off as map skill.",
        category: "Plot Threads",
        importanceLevel: "must-include",
        reason: "New detail that deepens Syr's deception and sets up a future confrontation",
        conflictNote: null,
      },
    ],
    approvedCount: 1,
    createdAt: "2024-02-03T19:45:00.000Z",
  },
  {
    id: "demo_h2",
    projectId: DEMO_PROJECT_ID,
    rawNotes:
      "Worked through the Marn subplot. Marn is the Shard Three resistance leader — she wants the blueprint to build a weapon that can threaten the other Shards and force a negotiation. Kael refuses. He didn't survive Veld Crossing to hand another general a better way to kill people. Syr is caught in the middle because she understands Marn's logic. Good three-way tension here. Also confirmed: the Hollow King's real name is Edras Vorn. He was an archivist too, before he disappeared.",
    suggestions: [
      {
        suggestedText: "Marn (Shard Three resistance leader) wants the blueprint weaponised as a negotiation threat. Kael refuses outright. Syr understands Marn's logic — three-way tension.",
        category: "Plot Threads",
        importanceLevel: "must-include",
        reason: "Key conflict that will drive Act Two",
        conflictNote: null,
      },
      {
        suggestedText: "The Hollow King's real name is Edras Vorn. He was an archivist before he disappeared — possibly also a former member of the Archivists' Council.",
        category: "Characters",
        importanceLevel: "useful-context",
        reason: "Important reveal that ties the antagonist to Syr's past",
        conflictNote: null,
      },
    ],
    approvedCount: 2,
    createdAt: "2024-02-10T22:10:00.000Z",
  },
];

export const DEMO_GENERATED_CONTEXT = `# Project Context — The Shattered Kingdom

## What This Is
A low-magic political fantasy novel. Grounded, morally complex, closer to Abercrombie than Tolkien. Magic is engineering — technology people no longer understand.

## Core Theme
"History is always written by those who control memory." The Shattering is the wound the world doesn't know it has.

## World: The Five Shards
Three hundred years ago, the continent was deliberately broken using ancient Resonance Engines — machines that vibrate at the harmonic frequency of stone. The official history calls it a geological catastrophe. Almost everyone believes this. The truth: the last Unified Emperor chose to destroy the continent rather than lose the Unification Wars. The Resonance Engines still run beneath each Shard. They are the only reason the fragments haven't sunk.

## Key Characters
- **Kael Ardyn** — former soldier, reluctant revolutionary. Lost his unit at the Battle of Veld Crossing. Principled, guarded, uses sarcasm as armour.
- **Syr Thessaly** — royal archivist who knows the Shattering was engineered. Worked for the Archivists' Council (the organisation actively burying this truth) for eleven years. Kael doesn't know this yet.
- **The Hollow King (Edras Vorn)** — former archivist turned antagonist. Wants the world to forget the Shattering happened permanently. Believes collective amnesia is the only path to peace.

## Current Story Position
Kael and Syr have reached Velmuun (Shard Three) with a fragment of an original Resonance Engine blueprint. The Hollow King's agents — the Silencers — are two days behind. Syr is navigating Velmuun from memory (she was stationed here during her Council years) and hiding this from Kael. Marn, the local resistance leader, wants the blueprint weaponised as a negotiation threat. Kael refuses. Three-way conflict ahead.

## Emotional Engine
Both protagonists are running from complicity. Kael from a command decision that killed his unit. Syr from eleven years of helping bury the truth. Their partnership forces them to stop running.`;

const DEMO_VERSION = "v2";
const DEMO_VERSION_KEY = "orgainise_demo_version";

export function seedDemoProject(): void {
  const seededVersion = localStorage.getItem(DEMO_VERSION_KEY);
  if (seededVersion === DEMO_VERSION && Storage.getProject(DEMO_PROJECT_ID)) return;

  // Clear any previous demo data (handles version upgrades)
  if (Storage.getProject(DEMO_PROJECT_ID)) {
    Storage.deleteProject(DEMO_PROJECT_ID);
  }

  Storage.saveProject(DEMO_PROJECT);
  DEMO_MEMORIES.forEach(m => Storage.saveMemory(m));
  DEMO_HISTORY.forEach(h => Storage.saveHistory(h));
  localStorage.setItem(DEMO_VERSION_KEY, DEMO_VERSION);
}
