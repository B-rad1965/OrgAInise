# OrgAInise Repository Review

## 1. Executive summary

OrgAInise has a strong product thesis and a surprisingly complete prototype: structured project memory, human-approved AI extraction, importance tiers, focused context generation, canon revision, onboarding, local persistence, optional authentication, and cloud backup are all represented in working code.

Its best design decision is that AI proposes changes but does not silently rewrite project memory. That trust model fits the product exceptionally well.

The current weakness is reliability rather than ambition. The product describes itself as long-term memory, but its persistence and synchronization model cannot yet guarantee that memory will survive multi-device use without conflicts or omissions. Cloud sync is effectively a collection of last-writer operations, not a real synchronization protocol. Revision snapshots are excluded from both cloud sync and export. Import is advertised but not implemented. There are also no automated tests, several security hardening gaps, and one very large project page containing most of the application logic.

Overall assessment:

- Product concept: excellent
- Prototype breadth: strong
- Core trust model: strong
- Architecture maturity: early beta
- Data durability: insufficient for a “long-term memory” promise
- Build Week demo readiness: close, but not ready without a focused stabilization pass

Confirmed findings below come directly from repository code. Items labeled “assumption” require runtime or user testing.

## 2. What is already excellent

### A. The product solves a clear, painful problem

The positioning—capture project knowledge once, maintain it as reality changes, and produce AI-ready context—is much sharper than a generic notes application. The README communicates that clearly in [`README.md`](README.md).

User impact: judges and users can understand the purpose quickly, and the output has an immediately demonstrable use: paste a generated context block into another AI conversation.

### B. Human approval is central to the AI workflow

Session analysis produces suggestions, but each suggestion must be approved or rejected before it becomes memory. The same pattern is used for canon revision. See [`artifacts/orgainise/src/pages/projects/[id].tsx`](artifacts/orgainise/src/pages/projects/%5Bid%5D.tsx) and [`artifacts/api-server/src/routes/ai.ts`](artifacts/api-server/src/routes/ai.ts).

Why this is excellent: project memory is authoritative state. Silent AI writes would make the system untrustworthy.

User impact: people retain control while still receiving meaningful automation.

### C. The Memory Bank model is simple and useful

Memories have a category and one of three importance levels:

- Must include
- Useful context
- Archive/reference

This is a compact model users can understand and the context generator can use effectively. See [`artifacts/orgainise/src/lib/storage.ts`](artifacts/orgainise/src/lib/storage.ts).

The category tools—rename, merge, delete-and-move, archive, category coverage, and writing-specific category packs—show unusually good product depth for a prototype.

### D. Revision is treated as evolution, not deletion

The revision workflow scans existing memories, proposes actions, lets the user edit or reject them, archives obsolete information by default, and creates a pre-change snapshot. See [`artifacts/orgainise/src/pages/projects/[id].tsx`](artifacts/orgainise/src/pages/projects/%5Bid%5D.tsx).

User impact: the product can preserve historical truth while keeping current AI context clean—one of OrgAInise’s key differentiators.

### E. Context generation has multiple useful modes

The repository supports:

- Short, medium, and full context
- Category selection
- Optional archive inclusion
- Focused, query-specific context
- Copy and text download

See [`artifacts/api-server/src/routes/ai.ts`](artifacts/api-server/src/routes/ai.ts) and [`artifacts/orgainise/src/pages/projects/[id].tsx`](artifacts/orgainise/src/pages/projects/%5Bid%5D.tsx).

The focused search is more useful than a literal text search because it produces an immediately reusable artifact.

### F. Local-first access is genuine

Authentication is optional, the UI remains available offline, and mutations write locally first. The app also tests whether localStorage is usable and displays persistence errors. See [`artifacts/orgainise/src/components/layout.tsx`](artifacts/orgainise/src/components/layout.tsx) and [`artifacts/orgainise/src/lib/synced-storage.ts`](artifacts/orgainise/src/lib/synced-storage.ts).

User impact: users can begin immediately and do not have to create an account before understanding the product.

### G. API boundaries and validation are reasonably structured

OpenAPI is used to generate React clients and Zod schemas. AI responses are parsed and validated instead of being trusted directly. See [`lib/api-spec/openapi.yaml`](lib/api-spec/openapi.yaml) and [`lib/api-client-react/src/custom-fetch.ts`](lib/api-client-react/src/custom-fetch.ts).

This is a strong foundation for separating frontend, API, and future mobile clients.

## 3. Bugs or risks

### Critical: cloud sync can lose or overwrite newer device state

On sign-in:

- Empty local storage causes a cloud pull.
- Any non-empty local storage causes a full push.

There is no comparison of revisions, timestamps, tombstones, or server state before that decision. See [`artifacts/orgainise/src/lib/synced-storage.ts`](artifacts/orgainise/src/lib/synced-storage.ts).

Example: device A has an old local project; device B edited it yesterday. Signing in on device A pushes the old state over the cloud version.

User impact: the product can erase the very long-term knowledge it promises to protect.

Recommendation: before pushing, fetch cloud metadata and perform an item-level merge using version numbers or `updatedAt`, surface conflicts, and preserve deletions with tombstones.

### Critical: cross-account upserts are not safely scoped to ownership

Project and memory IDs are global primary keys. `ON CONFLICT` updates records based on the ID alone without checking that the existing record belongs to the authenticated user. See [`artifacts/api-server/src/routes/data.ts`](artifacts/api-server/src/routes/data.ts).

A guessed or colliding ID could update another user’s record fields even though its `userId` remains unchanged.

Recommendation: use compound uniqueness such as `(user_id, client_id)`, server-generated UUIDs, or explicitly load and reject ownership conflicts before upserting.

User impact: prevents cross-tenant corruption and an avoidable security incident.

### High: revision snapshots are local-only and omitted from export

Snapshots use a separate localStorage key, but cloud hydration, bulk sync, project deletion, and export handle only projects, memories, and history. See [`artifacts/orgainise/src/lib/storage.ts`](artifacts/orgainise/src/lib/storage.ts) and [`artifacts/orgainise/src/pages/dashboard.tsx`](artifacts/orgainise/src/pages/dashboard.tsx).

Consequences:

- Snapshot undo disappears on another device.
- A backup is incomplete.
- Deleting a project leaves orphaned local snapshots.
- Cloud restoration does not restore revision history.

Recommendation: make revisions a first-class persisted entity and include them in delete, sync, import, and export.

### High: AI endpoints are public and unmetered

The AI routes do not require authentication and there is no rate limiting or request quota. See [`artifacts/api-server/src/routes/ai.ts`](artifacts/api-server/src/routes/ai.ts) and [`artifacts/api-server/src/app.ts`](artifacts/api-server/src/app.ts).

User/owner impact: anyone who can reach the server can consume the project’s OpenAI quota.

Recommendation: require an authenticated session or a tightly controlled anonymous allowance, then add per-user/IP rate limits and request-size limits.

### High: schema validation has effectively no domain limits

Generated schemas accept unbounded strings and arrays for notes, memories, sync payloads, and AI queries. Express accepts up to 10 MB. See [`lib/api-zod/src/generated/api.ts`](lib/api-zod/src/generated/api.ts) and [`artifacts/api-server/src/app.ts`](artifacts/api-server/src/app.ts).

Impact: unexpectedly high OpenAI bills, long latency, context-window failures, and denial-of-service exposure.

Recommendation: define explicit maximum lengths and counts in OpenAPI and reject or chunk oversized projects.

### Medium: fire-and-forget sync failures are mostly invisible

Per-item cloud writes log warnings but do not update durable retry state or notify the user. See [`artifacts/orgainise/src/lib/synced-storage.ts`](artifacts/orgainise/src/lib/synced-storage.ts).

Impact: the UI can appear “saved” because localStorage succeeded even when cloud backup is stale.

Recommendation: distinguish “saved locally” from “synced,” maintain an outbox, retry with backoff, and display unsynced item count.

### Medium: duplicate project does not duplicate its memories

`duplicateProject` copies only the project record. See [`artifacts/orgainise/src/lib/storage.ts`](artifacts/orgainise/src/lib/storage.ts).

Assumption: users will interpret “Duplicate project” as copying its Memory Bank, not creating an empty project shell.

Recommendation: either copy memories and optionally history, or rename the action “Reuse project structure.”

### Medium: export exists, import does not

The dashboard exports a JSON backup, but no import implementation appears in the repository.

Impact: users can download data but cannot restore it through the product. This undermines the meaning of “backup” and conflicts with the README’s import/export claim.

### Medium: clipboard and download operations lack failure handling

Clipboard writes are not awaited or caught, and generated download URLs are not always revoked. See [`artifacts/orgainise/src/pages/projects/[id].tsx`](artifacts/orgainise/src/pages/projects/%5Bid%5D.tsx).

Impact: mobile or permission-restricted users can receive a false “Copied” confirmation.

## 4. Architectural concerns

### The project detail page is a monolith

[`artifacts/orgainise/src/pages/projects/[id].tsx`](artifacts/orgainise/src/pages/projects/%5Bid%5D.tsx) is about 101 KB and owns memory CRUD, category management, session review, search, context generation, history, revision, multiple dialogs, and onboarding state.

Why it matters: it is difficult to test, reason about, or change safely. Subtle cross-flow regressions are increasingly likely.

Recommendation: split by domain:

- `MemoryBank`
- `SessionReview`
- `ContextBuilder`
- `FocusedSearch`
- `RevisionWorkflow`
- `ProjectCategories`
- Domain hooks/services for mutations

### Local storage is both persistence and application state

Each write rereads and serializes entire arrays, while components imperatively query storage after a custom event. See [`artifacts/orgainise/src/lib/storage.ts`](artifacts/orgainise/src/lib/storage.ts).

Impact: performance degrades with project size, atomicity is weak, migrations are absent, and corrupted data silently becomes an empty view.

Recommendation: move to IndexedDB with a versioned schema and repository interface. Keep local-first behavior, but make records incremental and transactional.

### Cloud sync is dual-write, not sync

Local writes and remote writes are separate operations with no transactional relationship. Bulk pushes are additive/upsert-only and do not reconcile missing records. Offline deletion can therefore leave stale cloud records.

Recommendation: introduce an append-only local mutation outbox, server acknowledgements, tombstones, and explicit conflict policy.

### Memory provenance is under-modeled

A memory stores text, category, importance, and timestamps—but not:

- Source session
- Human vs AI origin
- Confidence
- Supersedes/superseded-by relation
- Revision rationale
- Supporting evidence

Impact: the system can preserve facts but cannot explain why they are believed or how they evolved.

### Generated context has no provenance or reproducibility

The generated text is stored only in component state. It does not record which memory IDs, prompt version, model, filters, or timestamp produced it.

Recommendation: persist context runs and citations back to source memories. This would materially improve trust and evaluation.

## 5. UX improvements

1. **Separate “Save” and “Sync” language.** The current cloud icon and “Saved” label can describe only a localStorage write. Show “Saved locally,” “Syncing,” “Backed up,” and “3 changes pending.”

   Impact: users understand whether their work is actually protected.

2. **Add source citations to generated context.** Let users click a sentence to see the memories behind it.

   Impact: faster verification and much greater trust.

3. **Make revision history a timeline, not only “undo latest.”** Show change, reason, affected memories, author, and restore controls.

   Impact: users can understand project evolution rather than merely reverse one operation.

4. **Provide literal search alongside AI search.** Current project search sends the whole Memory Bank to OpenAI and generates a response. Add fast local keyword/filter search and keep “Ask Memory” as a separate action.

   Impact: instant, offline, predictable retrieval with lower cost.

5. **Improve mobile navigation.** Six compact project tabs are likely cramped on narrow screens.

   Assumption: this requires device testing.

   Recommendation: use a scrollable tab strip, bottom navigation, or task-based action menu.

6. **Make icon-only controls consistently labeled.** Several custom buttons and the clickable rename `<span>` depend on visual discovery.

   Impact: better keyboard, screen-reader, and mobile usability.

7. **Show context budget before generation.** Display included memory count, estimated tokens, excluded archive count, and likely cost.

   Impact: users understand what the AI will see and avoid oversized requests.

## 6. Missing features

Highest-value omissions are:

- Restore/import from exported backup
- Real sync conflict resolution
- Complete revision persistence
- Offline mutation queue
- Memory provenance and source links
- Local full-text search
- Attachments and document ingestion
- Automated tests and end-to-end smoke tests
- Data schema migrations
- Account data deletion and privacy controls
- Context citations and saved context runs
- Collaboration and project sharing
- Project-level AI/privacy settings
- Duplicate detection and memory consolidation
- Bulk editing and multi-select
- API usage limits and cost reporting

## 7. Highest-priority improvements before OpenAI Build Week

1. **Make persistence trustworthy.** Either disable automatic cloud push and label cloud sync beta, or implement safe pull/merge behavior.

   Why: silent data loss is the most damaging failure for this product.

2. **Add import/restore and include snapshots in backups.**

   Why: it creates a complete, demonstrable safety story in a small amount of work.

3. **Protect AI endpoints.** Add auth or anonymous quotas, rate limiting, and payload limits.

   Why: prevents a public demo from becoming an unrestricted API-cost proxy.

4. **Add a golden-path smoke test.** Cover: create project → add memory → analyze session → approve → generate context → revise → undo → export.

   Why: this is the Build Week demo and should never break unnoticed.

5. **Polish the demo narrative.** Seed a small but compelling project whose information visibly changes, then show focused context before and after revision.

   Why: it demonstrates the differentiator more clearly than listing every feature.

## 8. Longer-term roadmap

### Phase 1: Trustworthy 1.0

- IndexedDB storage and migrations
- Versioned sync/outbox/tombstones
- Complete import/export
- Revision persistence and provenance
- Automated unit/integration/end-to-end testing
- Security and accessibility audit

### Phase 2: Intelligent memory

- Semantic retrieval
- Entity and relationship extraction
- Contradiction detection
- Duplicate consolidation
- Temporal facts and effective dates
- Evidence-linked answers
- Memory health scoring

### Phase 3: Project operating system

- Attachments and source ingestion
- Integrations with repositories, documents, email, and calendars
- Shared projects and permissions
- Automated project digests
- Context APIs for external AI agents
- Branches/scenarios for alternative plans or story canon

## 9. Features that would make OrgAInise substantially smarter

- **Temporal memory:** distinguish “was true,” “became true,” and “is currently true.”
- **Knowledge graph:** identify people, systems, decisions, dependencies, and relationships.
- **Contradiction engine:** detect conflicts as new memories arrive, not only during manual revision.
- **Consolidation suggestions:** merge duplicates and summarize clusters without losing sources.
- **Retrieval scoring:** combine semantic similarity, recency, importance, category, and explicit user pinning.
- **Memory decay prompts:** ask whether stale assumptions remain valid.
- **Context evaluation:** score whether a generated context block answers the requested task and covers must-include memories.
- **Project gap detection:** identify missing decisions, unresolved questions, and underdeveloped domains.
- **Prompt/model version tracking:** make generated outputs reproducible and comparable.

These would turn OrgAInise from a curated memory store into a system that actively understands project evolution.

## 10. Features that would make OrgAInise substantially more useful

- Browser extension/share sheet for fast capture
- Import from ChatGPT exports, Markdown, documents, and repository files
- Attachments with source previews
- Saved context templates by task: “onboard a developer,” “continue chapter,” or “make a decision”
- One-click context copy with configurable token budget
- Calendar/session reminders
- Project sharing and read-only context links
- Mobile quick capture and voice notes
- API/MCP access for AI tools
- Backup scheduling and restore preview
- Bulk operations and keyboard command palette

## 11. Suggested Version 1.0 scope

Version 1.0 should promise one thing confidently:

> OrgAInise safely turns evolving project information into reviewed, traceable, reusable AI context.

Include:

- Projects and categorized Memory Banks
- Manual and AI-assisted capture
- Human approval for all AI writes
- Importance and archive states
- Literal and focused search
- Short/medium/full context generation
- Revision timeline with undo
- Complete import/export
- Reliable local-first storage
- Conflict-safe optional cloud backup
- Provenance for memories and generated context
- Mobile-responsive and WCAG-oriented core flows
- Test coverage for the golden path

Defer collaboration, broad third-party integrations, advanced graphs, and fully autonomous agents until the durability foundation is dependable.

## 12. Five highest-value next actions

1. **Replace automatic push-on-login with a safe sync decision.** Fetch both sides, compare versions, and never overwrite silently.
2. **Complete backup/restore, including revision snapshots.** This directly reinforces the product’s central promise.
3. **Secure and bound AI requests.** Require identity or quotas, rate-limit, and add schema limits.
4. **Add an end-to-end golden-path test plus targeted storage/sync tests.**
5. **Split the project page and introduce a versioned persistence repository.** This reduces the largest source of future regression risk.

## Validation and assumptions

Confirmed:

- No automated test files or configured test runner were found.
- Import is not implemented.
- Revision snapshots are omitted from sync/export.
- AI routes do not enforce authentication or rate limits.
- Sync is push/pull based rather than conflict-aware.
- The worktree remained clean during the review; no repository files were modified.

Validation limitations:

- Runtime typechecking could not be completed because dependencies were absent and pnpm attempted to fetch them automatically; registry TLS verification failed. The attempt was stopped, and its transient `node_modules` and `.pnpm-store` directories were removed.
- The UI, authentication provider, database, OpenAI calls, mobile devices, and assistive technologies were not run. Visual mobile and accessibility observations are therefore informed assumptions from static code, not confirmed runtime failures.

## Would I submit it to OpenAI Build Week in its current state?

**Not in its current state.**

The concept and feature set are submission-worthy, but the project’s central claim is durable long-term memory, while its current sync and backup behavior does not yet reliably uphold that claim.

The biggest difference in one day would come from a narrow trust-and-demo pass:

1. Disable risky automatic cloud overwrite or make sync explicitly manual and beta.
2. Add JSON import with validation and include revision snapshots in export.
3. Require authentication or strict quotas for AI endpoints and add input limits.
4. Add one golden-path smoke test.
5. Prepare a polished three-minute demo showing:
   - Messy session notes
   - Reviewed memories
   - Focused context
   - A project fact changing
   - Revision impact and undo
   - Export and restore

That would not make the system fully production-ready, but it would make the submission coherent, safer, and much more convincing.
