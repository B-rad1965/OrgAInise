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

  const systemPrompt = `You are an AI project memory assistant for OrgAInise. Your job is to analyze session notes and extract important information worth saving as project memory.

Rules:
- Do NOT save everything. Only extract: facts, decisions, rules, direction changes, open questions, meaningful insights, important updates.
- Avoid duplicates with existing memory. If something is already captured, do not suggest it again unless there's a meaningful update.
- Detect conflicts: if a new item appears to contradict or replace an older memory item, note it clearly.
- Keep suggestions concise and direct.
- Never save automatically — only return suggestions for the user to review.
- Map each suggestion to one of the provided categories.
- Return ONLY valid JSON matching the schema, no prose outside JSON.`;

  const userPrompt = `Project: "${projectName}" (${projectType})
Categories: ${categories.join(", ")}

Existing memory:
${existingMemoryText}

Session notes to analyze:
${sessionNotes}

Return a JSON object with a "suggestions" array. Each suggestion object must have:
- suggestedText: string (concise, clear fact/decision/rule)
- category: string (must be one of the provided categories)
- importanceLevel: "must-include" | "useful-context" | "archive-reference"
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

  const systemPrompt = `You are an AI assistant generating a project context block for OrgAInise. The context block will be pasted into another AI chat to quickly bring the model up to speed on a project.

Rules:
- Prioritize clarity and usefulness. No filler.
- Compress information — do not pad. Target approximately ${targetWords} words.
- Organize output clearly using the provided category headers.
- Start with PROJECT and TYPE.
- Only include categories that have content.
- Make it easy to read and act on. Short, punchy sentences.
- Return ONLY the formatted context block text, no explanation outside it.`;

  const userPrompt = `Generate a context block (~${targetWords} words) for this project:

Project: "${projectName}"
Type: ${projectType}

Memory:
${memoryText}

Format:
PROJECT: ${projectName}
TYPE: ${projectType}
[then each category with its content, using uppercase category names as headers]`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.4,
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
