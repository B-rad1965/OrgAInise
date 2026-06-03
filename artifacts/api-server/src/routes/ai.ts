import { Router, type IRouter } from "express";
import OpenAI from "openai";
import {
  AnalyzeSessionBody,
  AnalyzeSessionResponse,
  GenerateContextBlockBody,
  GenerateContextBlockResponse,
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
The core emotional and thematic architecture — themes, emotional engines, symbolic meanings, tone. Answer "why does this story work?", not "what happens?". Preserve full resonant phrasing; do not compress into bare bullet facts.

## Character DNA
Each significant character's emotional core: wound, desire, voice, arc direction. What drives them beneath the surface.

## Relationship DNA
What makes key relationships work emotionally — the tension, contrast, chemistry, what each person gives the other that no one else can.

## Lore / Magic / Rules
Confirmed world rules and constraints — how systems, magic, or technology work. Only include things established as definite fact.

## Canon Events
Confirmed plot events — things that definitively happened, established as fact. Do NOT include anything speculative or uncertain here.

## Working Theories
Ideas being actively explored, authorial speculation, directional thinking that isn't yet confirmed. This section MUST preserve all uncertainty language exactly — "maybe", "possibly", "potentially", "perhaps", "might", "could be", "I'm thinking", "considering whether". Never convert speculation into fact.

## Open Questions
Unresolved story decisions, explicit unknowns, things that still need to be figured out.

## Writing Guidance
How to work with the AI effectively on this project — tone instructions, what to encourage, what to avoid.

CRITICAL RULES FOR WRITING PROJECTS:
1. Uncertainty language is sacred. If a memory item says "maybe X" or "possibly Y", it MUST appear in Working Theories — never in Canon Events. Never strip "maybe", "possibly", "potentially", "perhaps" from any text.
2. Story DNA, Character DNA, and Relationship DNA items must NOT be compressed into bare facts. Preserve the emotional truth and resonant phrasing.
3. Canon Events must only contain things stated as definite, confirmed fact.
4. Separate confirmed from speculative at all times — a reader should immediately know which is which.` : "";

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

export default router;
