export type CanonStrength = "hard-canon" | "soft-canon" | "speculative";

export type WritingCategoryDef = {
  name: string;
  purpose: string;
  canonStrength: CanonStrength;
  contains: string;
  excludes: string;
  aiNote: string;
};

export const STANDARD_WRITING_CATEGORIES: WritingCategoryDef[] = [
  {
    name: "Story DNA",
    purpose: "The thematic and creative foundation of the story.",
    canonStrength: "soft-canon",
    contains: "Core premise, genre, tone, central themes, core emotional questions, narrative promise, story direction, philosophical conflicts, what the story is ultimately about beneath the plot.",
    excludes: "Character appearance, full biographies, scene-by-scene summaries, minor lore details.",
    aiNote: "Reference when evaluating whether new ideas fit the project's central identity, tone, and thematic direction.",
  },
  {
    name: "Character DNA",
    purpose: "The internal and emotional foundation of a character.",
    canonStrength: "soft-canon",
    contains: "Core wound, fear, desire, lie, truth, moral struggle, emotional contradiction, narrative function, theme connection, internal arc direction, what makes this character emotionally compelling.",
    excludes: "Height, hair, eye color, clothing, physical appearance, full plot summary.",
    aiNote: "Use to preserve emotional continuity, motivations, and thematic consistency. Never confuse with Character Bible (external appearance).",
  },
  {
    name: "Character Bible",
    purpose: "External, visual, behavioral, and practical continuity for a character.",
    canonStrength: "hard-canon",
    contains: "Age, height, build, complexion, hair, eyes, face shape, distinguishing features, clothing, weapons, accessories, voice, speech patterns, mannerisms, habits, body language, movement style, fighting style, visual keywords, how others perceive them.",
    excludes: "Core emotional arc, full story themes, deep relationship history, lore unrelated to depiction.",
    aiNote: "Use when generating scenes, dialogue, artwork prompts, character sheets, or visual continuity checks.",
  },
  {
    name: "Relationship Maps",
    purpose: "Emotional and narrative dynamics between characters.",
    canonStrength: "soft-canon",
    contains: "Relationship type, emotional foundation, what each character gives/needs, trust points, tension points, conflict triggers, power imbalance, how the relationship evolves, narrative function of the dynamic.",
    excludes: "Solo character appearance, individual biography unrelated to the dynamic, world lore.",
    aiNote: "Use when writing scenes between characters, evaluating chemistry, or tracking how bonds change over the story.",
  },
  {
    name: "Story Arc Maps",
    purpose: "Transformation paths for characters, relationships, factions, or storylines.",
    canonStrength: "soft-canon",
    contains: "Starting belief, starting emotional state, external goal, internal need, major tests, false solution, midpoint shift, breaking point, moment of truth, final choice, ending belief, cost of change, what is gained and lost.",
    excludes: "Static physical description, raw lore without arc relevance, minor trivia.",
    aiNote: "Use to preserve long-term development, avoid character regression, and ensure scenes serve the correct transformation path.",
  },
  {
    name: "World Bible",
    purpose: "The setting, cultures, history, systems, geography, politics, and rules of the world.",
    canonStrength: "hard-canon",
    contains: "Regions, kingdoms, cultures, religions, politics, history, geography, magic systems, technology, social structures, economy, languages, world rules, institutions, historical forces.",
    excludes: "Individual emotional arcs unless tied to world history, character visual details, scene drafts.",
    aiNote: "Use to maintain setting continuity, cultural consistency, political logic, and rule-based constraints.",
  },
  {
    name: "Canon Events",
    purpose: "Confirmed events in the story's established continuity.",
    canonStrength: "hard-canon",
    contains: "Major past events, confirmed backstory, character decisions that happened, deaths, betrayals, wars, discoveries, consequences, timeline anchors, events future writing must not contradict.",
    excludes: "Speculation, possible future directions, alternate timelines unless labeled, undecided ideas.",
    aiNote: "Treat as established facts. NEVER include anything speculative or uncertain. If a memory uses 'maybe', 'possibly', or 'might', it belongs in Open Questions — not here.",
  },
  {
    name: "Open Questions",
    purpose: "Unresolved ideas, undecided paths, and creative branches still under consideration.",
    canonStrength: "speculative",
    contains: "Unresolved character roles, possible future paths, alternate endings, name options, undecided lore mechanics, relationship possibilities, questions needing future decisions, branches to revisit.",
    excludes: "Final canon, locked facts, confirmed events, completed character definitions.",
    aiNote: "Treat as flexible — NOT canon. May brainstorm from these entries but must never present them as established truth. Preserve all uncertainty language exactly.",
  },
];

export const STANDARD_WRITING_CATEGORY_NAMES = STANDARD_WRITING_CATEGORIES.map(c => c.name);

export const GENRE_PACKS: Record<string, string[]> = {
  "Fantasy / Epic Fantasy": [
    "Magic System",
    "Artifact Registry",
    "Kingdoms & Factions",
    "Prophecies",
    "Creature Bestiary",
  ],
  "Science Fiction": [
    "Technology Bible",
    "Planetary Systems",
    "Alien Species",
    "Scientific Rules",
    "Ship & Equipment Registry",
  ],
  "Mystery / Thriller": [
    "Case Files",
    "Suspects",
    "Clues",
    "Red Herrings",
    "Timeline of Crime",
  ],
  "Game Project": [
    "Gameplay Systems",
    "Quest Design",
    "Faction Trees",
    "Character Classes",
    "Item Registry",
  ],
};

export function buildCategorySchemaPrompt(categories: string[]): string {
  const defs = STANDARD_WRITING_CATEGORIES.filter(c => categories.includes(c.name));
  if (defs.length === 0) return "";

  const lines = defs.map(d =>
    `${d.name} [${d.canonStrength}]\n  For: ${d.contains}\n  Not: ${d.excludes}\n  AI: ${d.aiNote}`
  );
  return `\nCATEGORY DEFINITIONS FOR THIS PROJECT:\n${lines.join("\n\n")}`;
}
