export type CategoryExample = {
  whatBelongsHere: string;
  exampleText: string;
  exampleImportance: "must-include" | "useful-context" | "archive-reference";
  helpTip: string;
};

const EXAMPLES: Record<string, CategoryExample> = {
  /* ── Trading / Investing ────────────────────────────────────────── */
  "Watchlist": {
    whatBelongsHere: "Stocks, assets, or ideas you're actively tracking but haven't entered yet.",
    exampleText: "SHOP — watching support between 132–136. Target allocation: $450. Waiting for volume confirmation before adding.",
    exampleImportance: "must-include",
    helpTip: "Things you're tracking but haven't acted on yet. Keeps the AI aware of what you're considering. e.g. \"SHOP — watching 132–136 support, waiting for volume confirmation.\"",
  },
  "Positions": {
    whatBelongsHere: "Open trades with entry price, target, and stop details.",
    exampleText: "AAPL 185c Jun 2025 — entered at $3.20. Target: $6.00. Stop: close below 178.",
    exampleImportance: "must-include",
    helpTip: "Current open trades with entry, target, and stop levels. Critical so the AI knows your live exposure. e.g. \"AAPL 185c — entered $3.20, target $6, stop below 178.\"",
  },
  "Strategy Rules": {
    whatBelongsHere: "Non-negotiable trading rules and risk management constraints.",
    exampleText: "Never size more than 2% of portfolio into a single options trade. No exceptions.",
    exampleImportance: "must-include",
    helpTip: "The non-negotiable rules governing your trades. Helps the AI give advice consistent with your approach. e.g. \"Never risk more than 2% per options trade. No exceptions.\"",
  },
  "Trading DNA": {
    whatBelongsHere: "Your core trading philosophy, preferred instruments, and time horizons.",
    exampleText: "Primary approach: trend-following with defined risk. Prefer equities and crypto. Swing trades 2–8 weeks.",
    exampleImportance: "must-include",
    helpTip: "Your trading identity — style, instruments, and time horizon. Gives the AI context for every recommendation. e.g. \"Trend-following, equities/crypto, swing trades 2–8 weeks.\"",
  },
  "Lessons Learned": {
    whatBelongsHere: "Hard-won trading lessons from mistakes or standout wins.",
    exampleText: "Averaging down on losers destroys accounts. Cut losses at the defined stop, every time.",
    exampleImportance: "must-include",
    helpTip: "Hard lessons from mistakes or wins. Prevents the AI repeating advice you've already learned the hard way. e.g. \"Averaging down on losers is forbidden — cut at the defined stop.\"",
  },
  "Market Thesis": {
    whatBelongsHere: "Your current macro view, sector preferences, and directional bets.",
    exampleText: "H1 2025: tech sector leading. AI infrastructure build-out has 2+ years of runway. Overweight semis.",
    exampleImportance: "useful-context",
    helpTip: "Your macro view and sector bets. Frames the AI's suggestions within your broader outlook. e.g. \"H1 2025: tech leading, AI infra has legs, overweight semis and cloud.\"",
  },

  /* ── Writing / Worldbuilding ────────────────────────────────────── */
  "Characters": {
    whatBelongsHere: "Character sketches, motivations, arcs, and relationships.",
    exampleText: "Elena: exiled diplomat, mid-30s. Goal: reclaim her family's name. Flaw: trusts logic over instinct, gets burned by it.",
    exampleImportance: "must-include",
    helpTip: "Character sketches, motivations, and relationships. Gives the AI the cast it needs to write consistent scenes. e.g. \"Elena: exiled diplomat, wants to reclaim family name, flaw is over-rationalism.\"",
  },
  "Worldbuilding": {
    whatBelongsHere: "Setting details, geography, history, and the rules of your world.",
    exampleText: "The Rift: a 200-mile scar in the continent where physics bends. Gravity is weaker, time moves faster.",
    exampleImportance: "useful-context",
    helpTip: "Setting rules, geography, and lore. Stops the AI from contradicting your world's internal logic. e.g. \"The Rift: 200-mile scar where gravity is weak and time moves faster.\"",
  },
  "Plot": {
    whatBelongsHere: "Story structure, key events, acts, and turning points.",
    exampleText: "Act 2 pivot: Elena discovers the treaty was forged. Exposing it means war, but staying silent means complicity.",
    exampleImportance: "must-include",
    helpTip: "Story structure and turning points. Keeps the AI oriented on where the story is and where it's going. e.g. \"Act 2: Elena discovers the treaty was forged — exposing it means war.\"",
  },
  "Story DNA": {
    whatBelongsHere: "The deeper themes, emotional core, and big truths your story is exploring.",
    exampleText: "Core theme: trust is earned through vulnerability, not strength. Every character arc should test this.",
    exampleImportance: "must-include",
    helpTip: "The emotional core and themes your story is really about. Keeps the AI tonally consistent across all scenes. e.g. \"Core theme: trust is earned through vulnerability, not strength.\"",
  },
  "Session History": {
    whatBelongsHere: "Brief logs of what happened in each writing session.",
    exampleText: "Apr 9: wrote chapter 4 opening (2,100 words). Resolved the Elena/Marcus tension subplot. Next: Act 2 midpoint.",
    exampleImportance: "archive-reference",
    helpTip: "Brief logs from each writing session. Tracks progress and helps the AI understand recent momentum. e.g. \"Apr 9: ch4 opening (2,100 words), resolved Elena/Marcus subplot. Next: Act 2 midpoint.\"",
  },

  /* ── Business / Startup ─────────────────────────────────────────── */
  "Vision": {
    whatBelongsHere: "The long-term goal and purpose of the business.",
    exampleText: "Build the default AI context manager for solopreneurs. Category leader in 3 years, profitable without VC.",
    exampleImportance: "must-include",
    helpTip: "Your company's long-term purpose. Grounds all AI advice in what you're actually building toward. e.g. \"Default AI context manager for solopreneurs. Category leader in 3 years.\"",
  },
  "Customer Pain": {
    whatBelongsHere: "The specific problems your target customers are experiencing.",
    exampleText: "Users re-explain their projects every new ChatGPT session. 10+ minutes of context-setting, every day.",
    exampleImportance: "must-include",
    helpTip: "The real problems your customers face. Keeps feature and messaging suggestions focused on what actually hurts. e.g. \"Users waste 10+ mins re-explaining projects to AI every session.\"",
  },
  "Features": {
    whatBelongsHere: "Product features, their status, and the decisions behind them.",
    exampleText: "Context Block generator: live. Generates compressed summary from tagged memories. V2 adds per-AI formatting.",
    exampleImportance: "useful-context",
    helpTip: "Product features and their status. Helps the AI track what's built vs. planned and reason about tradeoffs. e.g. \"Context Block generator: live. V2 will add per-AI formatting.\"",
  },
  "Business DNA": {
    whatBelongsHere: "Core principles, values, and non-negotiables for how the business operates.",
    exampleText: "No dark patterns. Users always own their data. Ship fast, iterate with real users, don't build in the dark.",
    exampleImportance: "must-include",
    helpTip: "Your business principles and non-negotiables. Ensures AI suggestions align with how you want to operate. e.g. \"No dark patterns. Users own their data. Ship fast, iterate with real users.\"",
  },
  "Revenue Model": {
    whatBelongsHere: "Pricing, monetisation approach, and revenue goals.",
    exampleText: "Freemium: free tier (3 projects), Pro $12/mo (unlimited). Target: 500 paying users by end of year.",
    exampleImportance: "useful-context",
    helpTip: "How you make money and what financial success looks like. Gives the AI context for prioritisation decisions. e.g. \"Freemium with $12/mo Pro. 500 paying users by EOY.\"",
  },

  /* ── Gardening / DIY ────────────────────────────────────────────── */
  "Garden Goals": {
    whatBelongsHere: "What you want to grow, achieve, or build this season.",
    exampleText: "2025 goal: 80% food self-sufficiency for vegetables. Prioritise high-yield, low-care crops.",
    exampleImportance: "must-include",
    helpTip: "What you want to grow or achieve this season. Grounds planning advice in your actual goals. e.g. \"2025: 80% veg self-sufficiency, focus on high-yield low-care crops.\"",
  },
  "Layout / Design": {
    whatBelongsHere: "Bed arrangement, zones, and spatial planning decisions.",
    exampleText: "North bed: permanent herbs. South bed: rotating annuals. West corner: compost zone. Shed shade until 2pm.",
    exampleImportance: "useful-context",
    helpTip: "How your garden is laid out. Prevents the AI from suggesting placements that contradict your space. e.g. \"North bed: herbs. South: rotating annuals. West: compost zone.\"",
  },
  "Plants": {
    whatBelongsHere: "What's planted, where, when, and any care notes.",
    exampleText: "Tomatoes (Roma, north bed, planted Mar 14): trellised, water every 2 days. Showing blossom end rot — check calcium.",
    exampleImportance: "must-include",
    helpTip: "What's planted, where, and any active care notes. Helps the AI give targeted advice about what's in the ground. e.g. \"Roma tomatoes, north bed, Mar 14 — showing blossom end rot, check calcium.\"",
  },
  "Garden DNA": {
    whatBelongsHere: "Your gardening philosophy, climate zone, and soil conditions.",
    exampleText: "Zone 8b, clay-heavy soil, mild winters. Organic only. Companion planting wherever possible.",
    exampleImportance: "must-include",
    helpTip: "Your garden's conditions and your approach. Zone, soil, and philosophy shape every recommendation. e.g. \"Zone 8b, clay soil, organic only, companion planting where possible.\"",
  },
  "Progress Notes": {
    whatBelongsHere: "Session logs, observations, and what you did this week.",
    exampleText: "Week of Apr 7: mulched raised beds, pruned the raspberries. Aphid problem on roses — neem oil applied.",
    exampleImportance: "archive-reference",
    helpTip: "What you did and observed recently. Helps the AI connect cause and effect across sessions. e.g. \"Apr 7 week: mulched beds, pruned raspberries, applied neem oil for aphids on roses.\"",
  },

  /* ── Research / Learning ────────────────────────────────────────── */
  "Key Concepts": {
    whatBelongsHere: "Core ideas and principles that are foundational to the topic.",
    exampleText: "Compounding: returns earned on previous returns. The earlier you start, the more powerful it becomes.",
    exampleImportance: "must-include",
    helpTip: "Foundational ideas you've confirmed you understand. Stops the AI from over-explaining concepts you already know. e.g. \"Compounding: returns on previous returns — time in market is the key variable.\"",
  },
  "Sources": {
    whatBelongsHere: "Books, papers, courses, or experts you're drawing from.",
    exampleText: "Thinking Fast and Slow (Kahneman) — key insight: System 1 drives most decisions; System 2 is mostly rationalisation.",
    exampleImportance: "useful-context",
    helpTip: "The sources you're studying. Helps the AI build on them instead of repeating or contradicting them. e.g. \"Kahneman's Thinking Fast and Slow — System 1 drives decisions, System 2 rationalises.\"",
  },
  "Questions": {
    whatBelongsHere: "Open questions, things you don't understand yet, and areas to investigate.",
    exampleText: "Why do index funds consistently beat active management, but hedge funds still attract massive capital?",
    exampleImportance: "useful-context",
    helpTip: "Unresolved questions you're working through. Guides the AI to help you answer them rather than repeat what you already know. e.g. \"Why do index funds outperform active management but hedge funds still get funded?\"",
  },
  "Research DNA": {
    whatBelongsHere: "Your research goals, methodology, and the lens you're using to study this topic.",
    exampleText: "Goal: understand behavioural economics well enough to apply it to personal finance. Focus: practical over theoretical.",
    exampleImportance: "must-include",
    helpTip: "Why you're studying this and how you approach it. Shapes the AI's answers to match your real learning goal. e.g. \"Goal: apply behavioural economics to personal finance. Practical focus over theoretical.\"",
  },
  "Insights": {
    whatBelongsHere: "Aha moments, surprising discoveries, and things that changed how you think.",
    exampleText: "Most bad financial decisions aren't about missing information — they're about emotional state at decision time.",
    exampleImportance: "must-include",
    helpTip: "Discoveries that changed how you think. The AI can build on these rather than arrive at conclusions you've already reached. e.g. \"Bad financial decisions are usually emotional, not informational.\"",
  },

  /* ── Shared / universal ─────────────────────────────────────────── */
  "Next Steps": {
    whatBelongsHere: "What you plan to do next — actions, tasks, or experiments.",
    exampleText: "1. Finish reading chapter 7. 2. Test the new landing page copy. 3. Schedule 3 user interviews.",
    exampleImportance: "useful-context",
    helpTip: "What you're planning to do next. Helps the AI give advice in the context of your immediate priorities. e.g. \"1. Finish ch.7. 2. Test landing page. 3. Schedule user interviews.\"",
  },
  "Open Questions": {
    whatBelongsHere: "Unresolved decisions, uncertainties, and things you're still figuring out.",
    exampleText: "Should we charge per-project or per-seat? Need to validate with 5 paying users before deciding.",
    exampleImportance: "useful-context",
    helpTip: "Things still unresolved. Signals to the AI where you need help thinking, not questions you've already answered. e.g. \"Per-project vs per-seat pricing — needs user validation before deciding.\"",
  },
  "Decisions": {
    whatBelongsHere: "Choices you've made with the reasoning behind them.",
    exampleText: "Chose PostgreSQL over MongoDB. Reason: relational data model fits better, team already knows SQL.",
    exampleImportance: "must-include",
    helpTip: "Choices you've made and why. Stops the AI from re-raising questions you've already settled. e.g. \"Chose PostgreSQL over MongoDB — relational model fits better, team knows SQL.\"",
  },
  "Notes": {
    whatBelongsHere: "General observations, reminders, and miscellaneous information.",
    exampleText: "Thursday demo is with the VP of Engineering. She cares about security and compliance, not features.",
    exampleImportance: "useful-context",
    helpTip: "General observations and context that doesn't fit neatly elsewhere. Catch-all for useful facts. e.g. \"Thursday demo with VP Engineering — she cares about security/compliance, not features.\"",
  },
  "Project DNA": {
    whatBelongsHere: "The deeper purpose, principles, and north star of the project.",
    exampleText: "Core principle: build for the user who doesn't have time to learn the tool. Complexity is a bug, not a feature.",
    exampleImportance: "must-include",
    helpTip: "The deeper purpose and principles of your project. Grounds all AI suggestions in what you're really building and why. e.g. \"Build for users with no time to learn. Complexity is a bug.\"",
  },
};

const DEFAULT_EXAMPLE: CategoryExample = {
  whatBelongsHere: "Any fact, decision, or discovery that matters for this project.",
  exampleText: "We decided to drop IE11 support — saves ~20% of frontend complexity with less than 1% user impact.",
  exampleImportance: "useful-context",
  helpTip: "Save facts, decisions, and discoveries that matter for this project. The more specific, the better the AI context. e.g. \"Dropped IE11 support — saves 20% frontend complexity, <1% user impact.\"",
};

export function getCategoryExample(category: string): CategoryExample {
  return EXAMPLES[category] ?? DEFAULT_EXAMPLE;
}

export function getCategoryHelpTip(category: string): string {
  return (EXAMPLES[category] ?? DEFAULT_EXAMPLE).helpTip;
}
