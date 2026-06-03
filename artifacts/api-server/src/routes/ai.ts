import { Router, type IRouter } from "express";
import OpenAI from "openai";
import {
  AnalyzeSessionBody,
  AnalyzeSessionResponse,
  GenerateContextBlockBody,
  GenerateContextBlockResponse,
  FocusedContextBlockBody,
  FocusedContextBlockResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

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

WHAT TO CAPTURE (any of these are worth saving):
- Story DNA: Core themes, emotional engines, symbolic meanings, relationship dynamics, character wounds and desires, signature lines, story breakthroughs, tone notes.
- Character DNA: A character's emotional core — what they fear, want, hide, how they speak, what drives their arc.
- Relationship DNA: What makes a relationship work emotionally — tension, contrast, what each person gives the other, the dynamic.
- Lore / Magic / Rules: Confirmed world rules, how systems work, hard constraints, established facts about the world.
- Canon Events: Things that definitively happened — established plot points stated as fact.
- Working Theories: Ideas being explored, directions being considered, authorial speculation. Preserve all uncertainty language.
- Open Questions: Unresolved decisions, things that need to be figured out, explicit unknowns.
- Writing Guidance: How the AI should help — style notes, tone, what to avoid, what to encourage.

Story DNA items deserve full, resonant phrasing — do not over-compress. Preserve emotional truth over brevity.` : "";

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

## Relationship DNA
What makes key relationships work emotionally — the tension, contrast, chemistry, what each person gives the other that no one else can.
For each relationship, include a **Narrative Function** note explaining why this dynamic is essential to the story.

## Lore / Magic / Rules
Confirmed world rules and constraints — how systems, magic, or technology work. Only include things established as definite fact.

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

Then organize all the provided memory into the structured sections described above (Story DNA, Character DNA, Relationship DNA, Lore/Magic/Rules, Canon Events, Working Theories, Open Questions, Writing Guidance). Map the user's categories intelligently to these sections — e.g. "Characters" maps to Character DNA, "Plot Threads" maps to Canon Events (confirmed) and Working Theories (speculative), "Worldbuilding" maps to Lore/Magic/Rules, etc.`;

  const userPrompt = `Generate a context block (~${targetWords} words) for this project:

Project: "${projectName}"
Type: ${projectType}

Memory:
${memoryText}

${isWriting ? writingFormat : nonWritingFormat}`;

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

export default router;
