import type { Project, MemoryItem, SessionHistory } from "./storage";
import { Storage } from "./storage";

export const DEMO_PROJECT_ID = "__demo__";

const D = "2024-01-01T00:00:00.000Z";

const DEMO_PROJECT: Project = {
  id: DEMO_PROJECT_ID,
  name: "Example Project",
  type: "Trading / Investing",
  categories: ["Watchlist", "Positions", "Strategy Rules", "Trading DNA", "Lessons Learned", "Market Thesis"],
  createdAt: D,
  updatedAt: D,
};

const DEMO_MEMORIES: MemoryItem[] = [
  {
    id: "demo_m1", projectId: DEMO_PROJECT_ID, category: "Watchlist",
    importanceLevel: "must-include",
    text: "SHOP — watching support between 132–136. Target allocation: $450. Waiting for volume confirmation before adding.",
    createdAt: D, updatedAt: D,
  },
  {
    id: "demo_m2", projectId: DEMO_PROJECT_ID, category: "Watchlist",
    importanceLevel: "useful-context",
    text: "NVDA — waiting for pullback to 480–490 range. High conviction long-term hold, no rush to enter.",
    createdAt: D, updatedAt: D,
  },
  {
    id: "demo_m3", projectId: DEMO_PROJECT_ID, category: "Positions",
    importanceLevel: "must-include",
    text: "AAPL 185c Jun 2025 — entered at $3.20. Target: $6.00. Stop: close below 178.",
    createdAt: D, updatedAt: D,
  },
  {
    id: "demo_m4", projectId: DEMO_PROJECT_ID, category: "Positions",
    importanceLevel: "must-include",
    text: "BTC — DCA position, 0.35 BTC total. Average entry ~$44,000. Long-term hold, no stop loss set.",
    createdAt: D, updatedAt: D,
  },
  {
    id: "demo_m5", projectId: DEMO_PROJECT_ID, category: "Strategy Rules",
    importanceLevel: "must-include",
    text: "Never size more than 2% of portfolio into a single options trade. No exceptions.",
    createdAt: D, updatedAt: D,
  },
  {
    id: "demo_m6", projectId: DEMO_PROJECT_ID, category: "Strategy Rules",
    importanceLevel: "must-include",
    text: "Always define risk before entering. If I cannot state the stop clearly, I don't take the trade.",
    createdAt: D, updatedAt: D,
  },
  {
    id: "demo_m7", projectId: DEMO_PROJECT_ID, category: "Trading DNA",
    importanceLevel: "must-include",
    text: "Primary approach: trend-following with defined risk. Prefer equities and crypto over forex.",
    createdAt: D, updatedAt: D,
  },
  {
    id: "demo_m8", projectId: DEMO_PROJECT_ID, category: "Trading DNA",
    importanceLevel: "useful-context",
    text: "Time horizon: swing trades 2–8 weeks for most positions. Core holdings 1–3 years.",
    createdAt: D, updatedAt: D,
  },
  {
    id: "demo_m9", projectId: DEMO_PROJECT_ID, category: "Lessons Learned",
    importanceLevel: "must-include",
    text: "Averaging down on losers destroys accounts. Cut losses at the defined stop, every time — no exceptions.",
    createdAt: D, updatedAt: D,
  },
  {
    id: "demo_m10", projectId: DEMO_PROJECT_ID, category: "Lessons Learned",
    importanceLevel: "useful-context",
    text: "Best trades come from patience. Waited 3 weeks for an AAPL setup — paid off. Rushed entries never work.",
    createdAt: D, updatedAt: D,
  },
  {
    id: "demo_m11", projectId: DEMO_PROJECT_ID, category: "Market Thesis",
    importanceLevel: "useful-context",
    text: "H1 2025 thesis: tech sector leading. AI infrastructure build-out has 2+ years of runway. Overweight semis and cloud.",
    createdAt: D, updatedAt: D,
  },
];

const DEMO_HISTORY: SessionHistory[] = [
  {
    id: "demo_h1",
    projectId: DEMO_PROJECT_ID,
    rawNotes:
      "Reviewed SHOP setup. Support held at 133 on decent volume. Didn't add yet — waiting for a clean break above 136.",
    suggestions: [
      {
        suggestedText: "SHOP — support held at 133 on volume. Watching for break above 136 before entry.",
        category: "Watchlist",
        importanceLevel: "must-include",
        reason: "Updated status on existing watchlist item",
        conflictNote: null,
      },
    ],
    approvedCount: 1,
    createdAt: "2024-01-10T14:30:00.000Z",
  },
  {
    id: "demo_h2",
    projectId: DEMO_PROJECT_ID,
    rawNotes:
      "Closed TSLA early because I got spooked by headlines. Didn't follow the rules — exited before the defined stop was hit. Net loss $180. Need to stop making emotional exits.",
    suggestions: [
      {
        suggestedText: "Closed TSLA early due to emotional exit — did not follow defined stop. Net loss $180.",
        category: "Lessons Learned",
        importanceLevel: "must-include",
        reason: "Important rule-break to remember",
        conflictNote: null,
      },
      {
        suggestedText: "Emotional exits based on headlines are never justified by the chart.",
        category: "Strategy Rules",
        importanceLevel: "must-include",
        reason: "Reinforced existing rule after a violation",
        conflictNote: null,
      },
    ],
    approvedCount: 2,
    createdAt: "2024-01-18T09:15:00.000Z",
  },
];

export const DEMO_GENERATED_CONTEXT = `# Trading Project Context — Example Project

## Core Strategy
Trend-following with defined risk management. Equities and crypto focus. Swing trades (2–8 weeks) and long-term core holdings (1–3 years). No forex.

## Hard Rules
- Never risk more than 2% of portfolio on a single options trade
- Always define the stop before entering — no stop = no trade
- Cut losses at the defined stop. No averaging down on losers. No emotional exits.

## Active Watchlist
- SHOP: watching 132–136 support zone, waiting for volume confirmation
- NVDA: waiting for pullback to 480–490 range

## Open Positions
- AAPL 185c Jun 2025 — entered at $3.20, target $6.00, stop below 178
- BTC — DCA position, avg entry ~$44k, long-term hold

## H1 2025 Market Thesis
Tech sector leading. AI infrastructure build-out has 2+ years of runway. Overweight semis and cloud.

## Recent Lessons
Closed TSLA early due to emotional exit — reinforced that emotional reasoning never overrides a defined stop.`;

export function seedDemoProject(): void {
  if (Storage.getProject(DEMO_PROJECT_ID)) return;
  Storage.saveProject(DEMO_PROJECT);
  DEMO_MEMORIES.forEach(m => Storage.saveMemory(m));
  DEMO_HISTORY.forEach(h => Storage.saveHistory(h));
}
