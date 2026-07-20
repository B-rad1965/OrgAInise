import { Router, type IRouter } from "express";
import OpenAI from "openai";
import {
  AnalyzeSessionBody,
  AnalyzeSessionResponse,
  GenerateContextBlockBody,
  GenerateContextBlockResponse,
  FocusedContextBlockBody,
  FocusedContextBlockResponse,
  ReviseMemoriesBody,
} from "@workspace/api-zod";
import { aiRateLimit } from "../middlewares/aiRateLimit";

const router: IRouter = Router();
router.use("/ai", aiRateLimit);

const WRITING_CATEGORY_SCHEMA = `
STANDARD WRITING CATEGORY DEFINITIONS (use when this project has these categories):
  Story DNA [soft-canon]       — Thematic foundation: premise, tone, themes, emotional questions, what the story is about beneath the plot. NOT character appearance, scene summaries, or minor lore.
  Character DNA [soft-canon]   — Internal/emotional core: wound, fear, desire, lie, truth, moral struggle, arc direction. NOT height, hair, clothing, or actions.
  Character Bible [hard-canon] — External/visual continuity: age, appearance, clothing, voice, speech patterns, mannerisms, body language. NOT emotional arc or relationship history.
  Relationship Maps [soft-canon]  — Emotional dynamics between characters: what each gives/needs, trust points, tension points, power imbalance, how the bond evolves. NOT solo biography or unrelated lore.
  Story Arc Maps [soft-canon]  — Transformation paths: starting belief → internal need → breaking point → final choice → what is gained/lost. NOT static traits or world facts.
  World Bible [hard-canon]     — Setting, cultures, history, magic systems, politics, geography, rules of the world. NOT individual emotional arcs or character visual details.
  Canon Events [hard-canon]    — Confirmed events in established continuity. Things that definitively happened. NEVER speculation — "maybe/possibly/might" items belong in Open Questions.
  Open Questions [speculative] — Unresolved ideas, undecided paths, creative branches still under consideration. NOT canon. Preserve ALL uncertainty language exactly as written.

Canon strength: hard-canon = treat as established fact; soft-canon = established direction, open to evolution; speculative = NOT canon, never present as truth.`;

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return null;
  }
  return new OpenAI({ apiKey });
}

/* ─── Analyze Session ────────────────────────────────────────────── */

router.post("/ai/analyze-session", async (req, res): Promise<void> => {
  const parsed = AnalyzeSessionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const openai = getOpenAIClient();
  if (!openai) {
    res.status(503).json({
      error:
        "OpenAI API key is not configured. Add OPENAI_API_KEY to your Replit Secrets to enable AI review.",
    });
    return;
  }

  const { projectName, projectType, categories, existingMemory, sessionNotes } =
    parsed.data;

  const existingMemoryText =
    existingMemory.length > 0
      ? existingMemory
          .map(
            (m) =>
              `[${m.category} | ${m.importanceLevel}] ${m.text}`
          )
          .join("\n")
      : "No existing memory yet.";

  const isWriting = projectType === "Writing / Worldbuilding";

  const writingGuidance = isWriting ? `

WRITING / WORLDBUILDING — extraction guidance:

UNCERTAINTY PRESERVATION (critical):
- If the session notes contain words like "maybe", "possibly", "potentially", "perhaps", "might", "could be", "I think", "not sure if", "wondering if" — preserve that language EXACTLY in the suggestedText.
- Never convert speculation into confirmed fact. "Maybe Syr is the traitor" must stay as "Maybe Syr is the traitor" — not "Syr is the traitor".
- Speculative items should go in "Working Theories" or "Open Questions" categories if those exist, and should use importanceLevel "useful-context" rather than "must-include".

WHAT TO CAPTURE — classify each item into the most specific matching category:
- Story DNA: Core premise, tone, themes, emotional questions, what the story is "about" at a deep level, philosophical conflicts, narrative promise.
- Character DNA: A character's emotional core — wound, fear, desire, lie, arc direction, moral struggle. NOT physical description.
- Character Bible: Physical/visual/behavioral continuity — appearance, clothing, voice, speech patterns, mannerisms, visual keywords. NOT emotional arc.
- Relationship Maps: What makes a relationship work emotionally — what each person gives/needs, trust/tension, power imbalance, how the dynamic evolves.
- Story Arc Maps: A character or storyline's transformation path — starting state, key tests, breaking point, final choice, what is gained/lost.
- World Bible: Confirmed world rules, history, geography, cultures, magic/technology systems, political structures, rules of the world.
- Canon Events: Things that definitively happened — confirmed plot points, backstory events, decisions already made. NEVER include speculation.
- Open Questions: Unresolved decisions, things still to figure out, creative branches being considered. Preserve ALL uncertainty language exactly.
- Writing Guidance: How the AI should help — style notes, tone instructions, what to avoid, what to encourage.
- If the project does not use these specific categories, map to the closest available project category.${WRITING_CATEGORY_SCHEMA}

Story DNA, Character DNA, and Relationship Maps items deserve full, resonant phrasing — do not over-compress. Preserve emotional truth over brevity.` : "";

  const systemPrompt = `You are an AI project memory assistant for OrgAInise. Your job is to analyze session notes and extract important information worth saving as project memory.

Rules:
- Do NOT save everything. Only extract: facts, decisions, rules, direction changes, open questions, meaningful insights, important updates.
- Avoid duplicates with existing memory. If something is already captured, do not suggest it again unless there's a meaningful update.
- Detect conflicts: if a new item appears to contradict or replace an older memory item, note it clearly.
- Keep suggestions concise and direct.
- Never save automatically — only return suggestions for the user to review.
- Map each suggestion to one of the provided categories.
- Return ONLY valid JSON matching the schema, no prose outside JSON.${writingGuidance}`;

  const userPrompt = `Project: "${projectName}" (${projectType})
Categories: ${categories.join(", ")}

Existing memory:
${existingMemoryText}

Session notes to analyze:
${sessionNotes}

Return a JSON object with a "suggestions" array. Each suggestion object must have:
- suggestedText: string (concise, clear fact/decision/rule; for Story DNA items, preserve the full emotional truth — do not over-compress; for speculative items, preserve ALL uncertainty words exactly as written)
- category: string (must be one of the provided categories)
- importanceLevel: "must-include" | "useful-context" | "archive-reference" (speculative/uncertain items should be "useful-context", not "must-include")
- reason: string (why this is worth saving)
- conflictNote: string or null (note if this conflicts with or updates existing memory)`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      res.status(503).json({ error: "AI returned an empty response. Please try again." });
      return;
    }

    let parsed2: unknown;
    try {
      parsed2 = JSON.parse(content);
    } catch {
      res.status(503).json({ error: "AI returned invalid JSON. Please try again." });
      return;
    }

    const validated = AnalyzeSessionResponse.safeParse(parsed2);
    if (!validated.success) {
      req.log.warn({ content, error: validated.error.message }, "AI response failed validation");
      res.status(503).json({ error: "AI response format was unexpected. Please try again." });
      return;
    }

    res.json(validated.data);
  } catch (err: unknown) {
    req.log.error({ err }, "OpenAI analyze-session error");
    if (
      err instanceof OpenAI.APIError &&
      err.status === 401
    ) {
      res.status(503).json({ error: "Invalid OpenAI API key. Check your OPENAI_API_KEY secret." });
      return;
    }
    res.status(503).json({
      error: "AI review couldn't complete. Please try again shortly.",
    });
  }
});

/* ─── Generate Context ───────────────────────────────────────────── */

router.post("/ai/generate-context", async (req, res): Promise<void> => {
  const parsed = GenerateContextBlockBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const openai = getOpenAIClient();
  if (!openai) {
    res.status(503).json({
      error:
        "OpenAI API key is not configured. Add OPENAI_API_KEY to your Replit Secrets to enable context generation.",
    });
    return;
  }

  const {
    projectName,
    projectType,
    length,
    selectedCategories,
    includeArchive,
    memoryItems,
  } = parsed.data;

  const wordTargets = { short: 500, medium: 1000, full: 2000 };
  const targetWords = wordTargets[length] ?? 1000;

  const filteredItems = memoryItems.filter((item) => {
    if (item.importanceLevel === "archive-reference" && !includeArchive) {
      return false;
    }
    return selectedCategories.includes(item.category);
  });

  if (filteredItems.length === 0) {
    res.json({
      content: `PROJECT: ${projectName}\nTYPE: ${projectType}\n\n(No memory items matched the selected categories and filters.)`,
    });
    return;
  }

  const memoryByCategory: Record<string, string[]> = {};
  for (const item of filteredItems) {
    if (!memoryByCategory[item.category]) {
      memoryByCategory[item.category] = [];
    }
    const importanceTag =
      item.importanceLevel === "must-include"
        ? "[MUST INCLUDE]"
        : item.importanceLevel === "archive-reference"
        ? "[ARCHIVE]"
        : "";
    memoryByCategory[item.category].push(
      importanceTag ? `${importanceTag} ${item.text}` : item.text
    );
  }

  const memoryText = Object.entries(memoryByCategory)
    .map(([cat, items]) => `${cat.toUpperCase()}:\n${items.map((t) => `- ${t}`).join("\n")}`)
    .join("\n\n");

  const isWriting = projectType === "Writing / Worldbuilding";

  const writingContextGuidance = isWriting ? `

WRITING PROJECT — OUTPUT STRUCTURE:
Organize the output using these sections (include only sections that have relevant content from the memory provided):

## Story DNA
The core emotional and thematic architecture — themes, emotional engines, symbolic meanings, tone. Answer "why does this story work?", not "what happens?". Preserve full resonant phrasing; do not compress into bare bullet facts. For each major theme or emotional truth, add a brief **Narrative Function** note (one sentence) explaining why it matters to the story.

## Character DNA
Each significant character gets their own subsection. Include:
- Their emotional core: wound, desire, voice, arc direction, what drives them beneath the surface
- **Narrative Function**: one sentence explaining why this character matters to the story — their role in the thematic argument, what they represent, what the story would lose without them
Do NOT reduce a character to a list of actions they took. Preserve their psychological interiority. A character is not "the person who did X" — they are the person who fears Y, wants Z, and is changed by the story in this specific way.

## Character Bible
Each character with external continuity data gets their own subsection. Include: age, physical description, clothing/style, voice, speech patterns, mannerisms, body language, visual keywords. This section is for depiction consistency — not emotional arc.

## Relationship Maps
What makes key relationships work emotionally — the tension, contrast, chemistry, what each person gives the other that no one else can.
For each relationship, include a **Narrative Function** note explaining why this dynamic is essential to the story.

## Story Arc Maps
Each character or storyline with a transformation path. Include: starting belief/state, the central internal need, key tests, the breaking point, the final choice, ending belief, what was gained and what was lost.

## World Bible / Lore / Magic / Rules
Confirmed world rules and constraints — how systems, magic, or technology work. Cultures, history, geography, political structures. Only include things established as definite fact.

## Canon Events
Confirmed plot events — things that definitively happened, established as fact. Do NOT include anything speculative or uncertain here. For events that are narratively significant (turning points, reveals, character-defining moments), add a brief **Narrative Function** note explaining what the event means beyond what happened.

## Working Theories
Ideas being actively explored, authorial speculation, directional thinking that isn't yet confirmed. This section MUST preserve all uncertainty language exactly — "maybe", "possibly", "potentially", "perhaps", "might", "could be", "I'm thinking", "considering whether". Never convert speculation into fact.

## Open Questions
Unresolved story decisions, explicit unknowns, things that still need to be figured out.

## Writing Guidance
How to work with the AI effectively on this project — tone instructions, what to encourage, what to avoid.

CRITICAL RULES FOR WRITING PROJECTS:
1. Uncertainty language is sacred. If a memory item says "maybe X" or "possibly Y", it MUST appear in Working Theories — never in Canon Events. Never strip "maybe", "possibly", "potentially", "perhaps" from any text.
2. Story DNA, Character DNA, and Relationship DNA must NOT be compressed into bare facts. Preserve emotional truth and resonant phrasing.
3. Foundational characters must receive their full Character DNA treatment — never reduce them to a passing event reference (e.g. "Kael lost his unit at Veld Crossing" is insufficient; you must also capture what that loss means for who Kael is).
4. Canon Events must only contain things stated as definite, confirmed fact.
5. Separate confirmed from speculative at all times — a reader should immediately know which is which.
6. Narrative Function notes are required for major characters, key relationships, significant events, and core themes. They answer: "Why does this element matter to THIS story?" — and they must be specific to this project. Generic phrases like "drives the plot forward", "represents hope", "creates conflict", or "is important to the story" are not acceptable. A good Narrative Function names the specific characters, themes, tensions, or consequences involved. Bad: "Kael's guilt drives the plot." Good: "Kael's guilt over Veld Crossing is the story's moral engine — it makes him distrust his own judgment exactly when the stakes demand he act decisively."
7. Cross-character shaping: if one character's wound, decision, history, or presence fundamentally shapes another major character's psychology or arc, state that relationship explicitly. Do not let each character exist as a self-contained entry if they are meaningfully entangled. Example: if Syr's complicity in a cover-up is the direct reason Kael cannot fully trust her, that causal link must appear — not just "Kael is suspicious of Syr" as a standalone fact.` : "";

  const systemPrompt = `You are an AI assistant generating a project context block for OrgAInise. The context block will be pasted into another AI chat to quickly bring the model up to speed on a project.

Rules:
- Prioritize clarity and usefulness. No filler.
- Compress information — do not pad. Target approximately ${targetWords} words.
- Start with PROJECT and TYPE.
- Only include sections that have content.
- Make it easy to read and act on.
- Return ONLY the formatted context block text, no explanation outside it.${writingContextGuidance}`;

  const nonWritingFormat = `Format:
PROJECT: ${projectName}
TYPE: ${projectType}
[then each category with its content, using the category name as a header]`;

  const writingFormat = `Format for writing projects:
PROJECT: ${projectName}
TYPE: ${projectType}

Then organize all the provided memory into the structured sections described above. Map the user's categories intelligently to these sections:
  • "Story DNA" → Story DNA
  • "Character DNA" → Character DNA
  • "Character Bible" → Character Bible
  • "Characters" → Character DNA (emotional) or Character Bible (appearance/behavioral)
  • "Relationship Maps" or "Relationship DNA" → Relationship Maps
  • "Story Arc Maps" → Story Arc Maps
  • "World Bible" → World Bible / Lore / Magic / Rules
  • "Worldbuilding", "Lore / Magic / Rules", "Lore", "Magic" → World Bible / Lore / Magic / Rules
  • "Canon Events", "Canon Notes" → Canon Events (confirmed facts only) or Working Theories (speculative)
  • "Plot Threads" → Canon Events (confirmed) and Working Theories (speculative)
  • "Open Questions" → Open Questions
  • "Working Theories" → Working Theories
  • "Writing Guidance", "Themes" → Writing Guidance or Story DNA
  • Any other category → nearest matching section by content`;

  const emptyCategories = selectedCategories.filter(
    cat => !filteredItems.some(item => item.category === cat),
  );
  const lowCategories = selectedCategories.filter(cat => {
    const count = filteredItems.filter(item => item.category === cat).length;
    return count > 0 && count <= 2;
  });

  const coverageNote = (isWriting && (emptyCategories.length > 0 || lowCategories.length > 0))
    ? `\n\nCATEGORY COVERAGE NOTE — include a brief "Coverage Note" section at the very end of the context block:
${emptyCategories.length > 0 ? `Empty (no entries): ${emptyCategories.join(", ")}` : ""}
${lowCategories.length > 0 ? `Underdeveloped (1-2 entries): ${lowCategories.join(", ")}` : ""}
One sentence per area. Example: "Character Bible details are missing — no visual or behavioral data exists yet."
Keep it factual and brief. Do not include this section if all categories have sufficient content.`
    : "";

  const userPrompt = `Generate a context block (~${targetWords} words) for this project:

Project: "${projectName}"
Type: ${projectType}

Memory:
${memoryText}

${isWriting ? writingFormat : nonWritingFormat}${coverageNote}`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
      max_tokens: length === "full" ? 3000 : length === "medium" ? 1500 : 800,
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      res.status(503).json({ error: "AI returned an empty response. Please try again." });
      return;
    }

    const validated = GenerateContextBlockResponse.safeParse({ content });
    if (!validated.success) {
      res.status(503).json({ error: "AI response format was unexpected. Please try again." });
      return;
    }

    res.json(validated.data);
  } catch (err: unknown) {
    req.log.error({ err }, "OpenAI generate-context error");
    if (err instanceof OpenAI.APIError && err.status === 401) {
      res.status(503).json({ error: "Invalid OpenAI API key. Check your OPENAI_API_KEY secret." });
      return;
    }
    res.status(503).json({
      error: "Context generation couldn't complete. Please try again shortly.",
    });
  }
});

/* ─── Focused Context Search ─────────────────────────────────────── */

router.post("/ai/focused-context", async (req, res): Promise<void> => {
  const parsed = FocusedContextBlockBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const openai = getOpenAIClient();
  if (!openai) {
    res.status(503).json({
      error: "OpenAI API key is not configured. Add OPENAI_API_KEY to your Replit Secrets to enable focused context.",
    });
    return;
  }

  const { projectName, projectType, query, memoryItems } = parsed.data;
  const isWriting = projectType === "Writing / Worldbuilding";

  const memoryText = memoryItems
    .map(item => {
      const tag = item.importanceLevel === "must-include"
        ? "[MUST INCLUDE]"
        : item.importanceLevel === "archive-reference"
        ? "[ARCHIVE]"
        : "";
      const date = item.createdAt
        ? new Date(item.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
        : "";
      return `[${item.category}${date ? ` · ${date}` : ""}${tag ? ` · ${tag}` : ""}] ${item.text}`;
    })
    .join("\n");

  const writingStructure = isWriting ? `
Use this output structure (include only sections with relevant content):

PROJECT: ${projectName}
FOCUSED TOPIC: ${query}
TYPE: ${projectType}

## Summary
Brief overview of what is known about this topic from the project memory.

## Story DNA
Relevant themes, emotional engines, symbolic meanings — specific to this topic. For each, include a Narrative Function note explaining why it matters to THIS story (not a generic description).

## Character DNA
Each relevant character gets a subsection with: their emotional core (wound, desire, arc), their connection to this topic, and a Narrative Function note — one sentence explaining their specific role in the thematic argument. Never reduce a character to their plot actions alone. If one character's history or wound fundamentally shapes another character's psychology or arc, state that causal link explicitly.

## Relationship DNA
Relevant relationship dynamics, with a Narrative Function note for each explaining why the dynamic is essential to the story.

## Lore / Magic / Rules
Confirmed world rules and constraints relevant to this topic.

## Canon Events
Confirmed events related to this topic. For narratively significant events, include a Narrative Function note explaining what the event means beyond what happened.

## Working Theories
Relevant speculation — MUST preserve all uncertainty words exactly (maybe, possibly, potentially, perhaps, might, could be). Never convert speculation into fact.

## Open Questions
Unresolved questions related to this topic.

## Writing Guidance
How future AI sessions should use this focused context when working on this topic.` : `
Use this output structure:

PROJECT: ${projectName}
FOCUSED TOPIC: ${query}
TYPE: ${projectType}

## Summary
Brief overview of what is known about this topic from the project memory.

[Then include only the relevant categories from the project, using the category name as a header. Only include categories that have relevant content.]`;

  const systemPrompt = `You are an AI assistant generating a FOCUSED context block for OrgAInise. The user has searched their project memory for a specific topic, character, relationship, or question.

Your job:
1. Identify which memory items are genuinely relevant to the search query
2. Generate a focused, useful context block covering only that topic
3. Count how many distinct memory items you considered relevant (matchedCount)

Rules:
- Include only information genuinely relevant to the query — no padding with unrelated content
- Preserve narrative significance, not just facts. A character is more than "the person who did X"
- Narrative Function notes must be specific to this project — avoid generic phrases like "drives the plot", "represents hope", or "creates conflict". Name the specific characters, tensions, themes, or consequences involved
- Distinguish confirmed canon from working theory — never convert speculation into confirmed fact
- Preserve all uncertainty words (maybe, possibly, potentially, perhaps, might, could be) exactly as written
- After each key piece of information, include a source reference in brackets — the category and date it was saved: [from: Characters · 1 Jan 2024]
- If no strong matches exist, say so clearly in the Summary section and suggest broader search terms the user might try
- Return ONLY valid JSON matching the schema: { "content": "...", "matchedCount": N }${writingStructure}`;

  const userPrompt = `Project: "${projectName}" (${projectType})
Search query: "${query}"

All project memory (${memoryItems.length} items):
${memoryText}

Identify the relevant items, generate the focused context block, and return JSON with "content" (the formatted block) and "matchedCount" (number of relevant memory items you used).`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: 2500,
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      res.status(503).json({ error: "AI returned an empty response. Please try again." });
      return;
    }

    let raw: unknown;
    try {
      raw = JSON.parse(content);
    } catch {
      res.status(503).json({ error: "AI returned invalid JSON. Please try again." });
      return;
    }

    const validated = FocusedContextBlockResponse.safeParse(raw);
    if (!validated.success) {
      req.log.warn({ content, error: validated.error.message }, "AI focused-context response failed validation");
      res.status(503).json({ error: "AI response format was unexpected. Please try again." });
      return;
    }

    res.json(validated.data);
  } catch (err: unknown) {
    req.log.error({ err }, "OpenAI focused-context error");
    if (err instanceof OpenAI.APIError && err.status === 401) {
      res.status(503).json({ error: "Invalid OpenAI API key. Check your OPENAI_API_KEY secret." });
      return;
    }
    res.status(503).json({ error: "Focused context search couldn't complete. Please try again shortly." });
  }
});

/* ── POST /ai/revise-memories ──────────────────────────────────── */

router.post("/ai/revise-memories", async (req, res): Promise<void> => {
  const parsed = ReviseMemoriesBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const openai = getOpenAIClient();
  if (!openai) { res.status(503).json({ error: "OpenAI API key not configured." }); return; }

  const { projectName, projectType, revisionStatement, memoryItems } = parsed.data;

  if (memoryItems.length === 0) {
    res.json({ summary: "No active memories to analyse.", matches: [] });
    return;
  }

  const numberedItems = memoryItems
    .map((m, i) => `[${i + 1}] ID:${m.id} | Category: ${m.category} | Level: ${m.importanceLevel}\n"${m.text}"`)
    .join("\n\n");

  const systemPrompt = `You are a canon consistency engine for the project "${projectName}" (${projectType}).

Your job is to evaluate every memory item in this project's knowledge base and determine which ones need to change as a result of a stated revision. You must reason about BOTH direct impacts (items that explicitly reference the changed element) AND indirect narrative impacts (items whose underlying truth, thematic coherence, or story logic is destabilised by the change, even if they never mention the changed element by name).

═══════════════════════════════════════════════════════════════
REVISION REQUESTED: "${revisionStatement}"
═══════════════════════════════════════════════════════════════

━━━ PHASE 1: CLASSIFY THE REVISION ━━━

Before evaluating any individual item, reason about what KIND of change this is and its MAGNITUDE:

CHANGE TYPES (pick one):
  rename           — a name/label is changing, content stays the same
  character-identity — a character's nature, role, power, or motivation is changing
  relationship     — a significant relationship between characters is changing
  magic-system     — a core mechanic, rule, or scope of the magic/power system is changing
  worldbuilding    — a significant element of the world's history, geography, or rules is changing
  conflict         — the central conflict, antagonist, or stakes are changing
  theme            — the story's thematic or tonal direction is changing
  plot-structure   — a plot arc, act, or narrative event is changing or being cut
  minor-detail     — a small factual detail is changing with limited downstream effect

MAGNITUDE:
  minor   — affects isolated facts; ripple effects are minimal
  moderate — affects a subset of the story; some downstream consequences
  major   — affects identity-level truths, core relationships, or the thematic foundation; broad downstream consequences

Rename requests are always MINOR magnitude unless the renamed entity is a central character.
Changes to a character identity, magic system, central relationship, or core conflict are MAJOR magnitude.

CATEGORY CANON STRENGTH — apply when evaluating impact severity:
  hard-canon categories (Canon Events, Character Bible, World Bible): conflicts are high-severity — these items assert established facts, so a change that contradicts them is unambiguous and must be addressed.
  soft-canon categories (Story DNA, Character DNA, Relationship Maps, Story Arc Maps): changes may affect thematic coherence, character motivation, or arc continuity — flag conflicts for review or archive.
  speculative categories (Open Questions): changes rarely break anything — these entries are not canon and naturally evolve with the project. Only flag if the question is now entirely moot.

━━━ PHASE 2: EVALUATE EVERY ITEM ━━━

Evaluate ALL items for impact — do NOT skip any. For each item ask:

  A. DIRECT IMPACT — Does this item explicitly describe, name, or depend on the changed element?
     If yes → propose the appropriate action.

  B. INDIRECT / CAUSAL IMPACT — Even if the item never mentions the changed element, does this revision:
     • Invalidate a narrative truth the item relies on?
     • Create a logical contradiction with what the item states?
     • Make a stated question moot, already-answered, or wrongly framed?
     • Break thematic consistency the item was written to reflect?

━━━ SPECIAL RULES FOR NARRATIVE ANCHOR CATEGORIES ━━━

The following categories carry the project's structural and thematic DNA. They require DEEPER scrutiny for indirect impacts, even if the revision doesn't name them directly:

  Story DNA      — Foundational truths that define what this project IS. Ask: is this still true after the change?
  Themes         — The story's moral/emotional arguments. Ask: does this theme still hold, contradict, or need reframing?
  Open Questions — Unresolved story mysteries. Ask: is this question now moot, answered, or altered by the change?
  Canon Notes    — Established facts about the world. Ask: does this fact still accurately describe the world post-revision?

For MAJOR-magnitude changes, you MUST evaluate every item in these categories and propose action on any that are now inconsistent — even if the connection is inferential rather than literal.

━━━ ACTIONS ━━━

  "archive"      — The item is outdated or inconsistent. Soft-archives it (kept, excluded from context). PREFER over "delete".
  "rewrite"      — The item is partially valid but needs updating. Provide the COMPLETE new text in proposedText.
  "recategorize" — The item now belongs in a different category. Provide the target category in proposedCategory.
  "delete"       — Permanently remove. Use ONLY when the item is entirely wrong and archiving is clearly insufficient.
  "review"       — Flag for user attention. The memory plausibly conflicts with or relates to the revision but a confident rewrite cannot be proposed. The user will read it and decide. Use this rather than silently omitting uncertain impacts.
  "keep"         — Unaffected. Do NOT include "keep" items in your output — omit them entirely.

━━━ PHASE 3: DEPENDENCY EXPANSION SCAN ━━━

This phase runs for MODERATE and MAJOR revisions AND as a mandatory zero-result gate for any revision where Phase 2 produced no matches.

ZERO-RESULT GATE: If Phase 2 produced zero matches, you MUST complete this phase before concluding the revision affects nothing. Do not return an empty matches list until this scan is finished and confirmed empty.

Step 1 — Extract primary concepts from the revision statement:
  • RETIRED concepts: names, lore terms, entities, systems, or ideas being replaced or removed
  • NEW concepts: names, lore terms, systems, or ideas being introduced
  • AFFECTED domains: characters, locations, factions, magic systems, relationships, plot arcs, themes

Step 2 — DEPENDENCY EXPANSION: expand each retired/changed primary concept into a dependency set before scanning.
For each primary concept, ask:
  • Which named entities (characters, creatures, places, artefacts, organisations) are defined by, derived from, or only make sense because of this concept?
  • Which relationships between characters or factions are premised on this concept?
  • Which open questions, unresolved mysteries, or working theories are downstream of this concept?
  • Which writing guidance, tonal instructions, or craft notes exist specifically to support this concept?
  • Which world-truths, rules, or histories only hold if this concept is true?

Collect all of these into an EXPANDED CONCEPT SET. The scan in Step 3 runs against this expanded set — not just the primary concept names. A memory does NOT need to mention the primary concept by name; it only needs to reference something in the expanded set.

Step 3 — Test EVERY memory not already flagged against the expanded concept set:
  • Does it reference an entity, relationship, question, theory, or rule that is in the expanded set?
  • Does it describe world-state that only holds if the retired concept is still true?
  • Does it belong to a category in scope of the revision (Themes, Story DNA, Open Questions, Canon Notes)?
  • Would a reader encountering this memory after the revision find it inconsistent or misleading — even if the primary concept is never named?

THE INCLUSION BAR IS: "This memory references something in the expanded concept set."
Referencing an entity, question, relationship, or theory that belongs to the retired concept is sufficient. Confidence about the specific impact is not required — flag it as "review" and let the user decide.

Step 4 — Include ALL memories that passed Step 3 as "review" with a reason that names the specific dependency found. Example: "References [Entity X], which derives from the retired [Primary Concept] — its meaning may change under the new direction."

Step 5 — Count unflagged memories. If more than 60% remain unflagged after a MAJOR revision, re-examine them — a major change rarely leaves most of the memory bank untouched.

CRITICAL RULE: You MUST NOT return an empty matches list for any revision until this dependency expansion scan is complete. If the scan finds expanded matches, surface them as "review" candidates. Only return zero matches if the expanded concept set produces no hits across the full memory bank.

━━━ BIAS AND CONFIDENCE ━━━

  • Prioritise CORRECTNESS over conservatism for major changes — if canon is broken, say so.
  • Always prefer "archive" over "delete".
  • "review" is the safe fallback for uncertain impacts — prefer it over both "keep" and "delete" when impact is plausible but not provable.
  • For RENAME requests: propose "rewrite" for EVERY item that mentions the old name, with corrected text.
  • confidence "high"   → the impact is clear and unambiguous
  • confidence "medium" → the impact is likely but relies on inference
  • confidence "low"    → the impact is possible; use "review" or "archive", never "rewrite" or "delete"
  • Never use "rewrite" or "delete" at low confidence.
  • reason must explain the CAUSAL logic, not just restate the change. For "review" items, explain what specific conflict or uncertainty prompted the flag.
  • Never use internal system terms like "archive-reference" in reasons — use plain language.

Return ONLY valid JSON (no markdown, no commentary):
{
  "summary": "2–3 sentences describing the change type, magnitude, and the scope of direct and indirect impacts found.",
  "totalScanned": <integer — total number of memory items you evaluated across all phases>,
  "matches": [
    {
      "memoryId": "...",
      "currentText": "...",
      "proposedAction": "archive" | "rewrite" | "delete" | "recategorize" | "review",
      "proposedText": "..." or null,
      "proposedCategory": "..." or null,
      "reason": "...",
      "confidence": "low" | "medium" | "high"
    }
  ]
}`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Memory items to analyse:\n\n${numberedItems}` },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    let aiResult: { summary?: unknown; matches?: unknown };
    try {
      aiResult = JSON.parse(raw);
    } catch {
      req.log.error({ raw }, "revise-memories: failed to parse AI JSON");
      res.status(503).json({ error: "AI returned invalid JSON." });
      return;
    }

    const summary      = typeof aiResult.summary === "string" ? aiResult.summary : "Analysis complete.";
    const totalScanned = typeof (aiResult as Record<string, unknown>).totalScanned === "number"
      ? (aiResult as Record<string, unknown>).totalScanned as number
      : memoryItems.length;
    const rawMatches = Array.isArray(aiResult.matches) ? aiResult.matches : [];
    const validActions = new Set(["keep", "archive", "rewrite", "delete", "recategorize", "review"]);
    const validConf    = new Set(["low", "medium", "high"]);
    const knownIds     = new Set(memoryItems.map(m => m.id));

    const matches = rawMatches
      .filter((m): m is Record<string, unknown> => typeof m === "object" && m !== null)
      .filter(m => typeof m.memoryId === "string" && knownIds.has(m.memoryId as string))
      .filter(m => validActions.has(m.proposedAction as string))
      .filter(m => validConf.has(m.confidence as string))
      .map(m => ({
        memoryId:        m.memoryId as string,
        currentText:     typeof m.currentText === "string" ? m.currentText : "",
        proposedAction:  m.proposedAction as string,
        proposedText:    typeof m.proposedText === "string" ? m.proposedText : null,
        proposedCategory: typeof m.proposedCategory === "string" ? m.proposedCategory : null,
        reason:          typeof m.reason === "string" ? m.reason : "",
        confidence:      m.confidence as string,
      }));

    res.json({ summary, totalScanned, matches });
  } catch (err) {
    req.log.error({ err }, "revise-memories: OpenAI call failed");
    res.status(503).json({ error: "AI service temporarily unavailable." });
  }
});

export default router;
