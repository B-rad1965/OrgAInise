# OrgAInise

**Living project memory for long-running AI collaboration.**

AI conversations are useful working sessions, but they are not a durable
project record. OrgAInise turns session notes into a curated memory bank that
can be reviewed, revised, backed up, synchronized, and reused as focused context
in future conversations.

**Capture knowledge once. Organize it intelligently. Reuse it forever.**

## The problem

The longer a project continues, the more its context fragments across chats.
Decisions become difficult to find, changed assumptions compete with old ones,
and each new conversation begins with another attempt to explain the project.

Copying an entire transcript forward is not a reliable solution. It carries
noise alongside useful context, consumes attention and prompt space, and does
not distinguish a confirmed decision from an abandoned idea.

Traditional notes preserve information, but they do not help determine what an
AI assistant should know for the next task. Chat history provides continuity,
but it is difficult to curate as the work evolves.

## Why OrgAInise exists

OrgAInise bridges the gap between disposable AI conversations and durable
project knowledge. It provides one place to turn working-session output into
structured, human-approved memory, then assemble only the relevant knowledge
for the next conversation.

The goal is not to replace AI chat or preserve every message. It is to maintain
a trustworthy handoff between sessions so that useful context survives while
the project continues to change.

## How it works

1. **Create a project** and define categories for its memory bank.
2. **Capture knowledge** directly or paste notes from an AI working session.
3. **Review suggestions** before accepting AI-proposed memory items.
4. **Generate context** at the length and scope needed for the next task.
5. **Revise deliberately** when a project assumption or established fact
   changes.
6. **Protect the record** with local persistence, JSON backups, revision
   snapshots, and optional authenticated cloud synchronization.

OrgAInise treats AI as decision support, not as the authority over project
memory. The user decides what becomes part of the record.

## Key features

- **Project memory banks** organize facts, decisions, constraints, references,
  and open questions into project-specific categories.
- **Importance levels** distinguish must-include memory, useful context, and
  archived reference material.
- **AI-assisted session review** converts working notes into structured
  suggestions that can be approved or rejected individually.
- **Context generation** creates short, medium, or full context blocks from
  selected categories, with archived references included only when requested.
- **Focused context** finds memories relevant to one topic and produces a
  smaller context block that can be copied or saved to the project.
- **Revision impact analysis** identifies memories that may need to be kept,
  rewritten, recategorized, archived, or deleted after a project change.
- **Revision snapshots** preserve the memory bank before approved revisions and
  allow the latest change to be undone.
- **Session history** retains notes, suggestions, and approval counts for the
  ten most recent update sessions in each project.
- **Search and sorting** make growing project collections easier to navigate.
- **Local-first storage** keeps the organizer usable without requiring sign-in.
- **Optional cloud sync** gives authenticated users a PostgreSQL-backed copy of
  projects, memories, and session history.
- **Backup and restore** exports a validated, versioned JSON archive containing
  projects, memories, history, and revision snapshots.

## Screenshots

Final submission screenshots should show the product workflow rather than
isolated UI components.

| View | Suggested capture |
| --- | --- |
| Dashboard | Projects, search and sorting, backup controls, and sync state |
| Memory Bank | Categorized memories and importance labels |
| Update Session | AI suggestions awaiting explicit approval |
| Context Block | Generated context with length and category controls |
| Revise Memory | Impact analysis and snapshot-protected revisions |

Place final images under `docs/screenshots/` and embed them here:

```markdown
![OrgAInise dashboard](docs/screenshots/dashboard.png)
![OrgAInise memory bank](docs/screenshots/memory-bank.png)
```

## Demo video

**Demo link:** _Add the final Build Week video URL here._

A concise demo should cover:

1. creating a project;
2. turning session notes into approved memories;
3. generating focused, reusable context;
4. revising an established fact with impact analysis; and
5. showing backup and synchronization status.

## Technology stack

OrgAInise is a TypeScript monorepo built around a React web application and an
Express API.

| Layer | Technology |
| --- | --- |
| Interface | React 19, Vite, Tailwind CSS, Radix UI, Wouter |
| API | Express 5, TypeScript, Zod |
| Data | Browser `localStorage`, PostgreSQL, Drizzle ORM |
| AI | OpenAI `gpt-4o` through a server-side proxy |
| Authentication | Replit OIDC with secure server sessions |
| Contract | OpenAPI with generated request and validation types |

The browser writes project data locally first. The API keeps credentials
server-side, handles authenticated cloud data, validates AI requests and
responses, and applies rate limits to AI endpoints.

## Trust, data safety, and human approval

OrgAInise is designed to avoid silent data loss and unreviewed AI changes.

- AI suggestions do not enter project memory until the user approves them.
- Revision analysis proposes actions; it does not silently rewrite the memory
  bank.
- Up to five pre-revision snapshots are retained per project for local undo.
- Backup imports are size-limited and validated for structure, timestamps,
  duplicate IDs, project relationships, and snapshot consistency.
- Restore and cloud-pull writes are verified and rolled back if browser storage
  cannot be updated completely.
- Individual cloud saves and deletes use optimistic timestamp checks to reject
  stale mutations.
- Bulk cloud pushes are transactional and stop on ownership, relationship, or
  content conflicts rather than partially applying data.
- Cloud pulls merge newer records, preserve local-only work, and stop before
  changing local data when versions are ambiguous.
- Local save failures, cloud failures, paused synchronization, and conflicts are
  reported in the interface.
- OpenAI credentials remain on the server; AI inputs are bounded and endpoints
  are rate-limited.

This model deliberately favors preserving both copies over guessing which
version is correct.

## Current limitations

- OrgAInise is a single-user project-memory tool, not a real-time collaborative
  editor.
- Full cloud push/pull reconciliation is user-triggered. Authenticated edits
  also attempt background per-record cloud writes.
- Revision snapshots are browser-local unless included in an exported backup.
- There are no deletion tombstones, so ambiguous pulls preserve local-only
  records rather than propagating uncertain deletions.
- AI workflows require network access and a configured OpenAI key, and their
  output still requires human review.
- The current deployment and authentication path is designed for Replit.

## Roadmap

- Automated regression coverage for synchronization, backup validation, and
  snapshot recovery.
- Cloud-backed snapshots and explicit deletion tombstones.
- A durable distributed AI rate limiter.
- Richer attachment and image support.
- Additional authentication and deployment options.
- Accessibility and mobile usability audits.

Roadmap items are directions, not currently shipped features.

## Credits and license

OrgAInise was created as a Build Week project and refined through use on
long-running creative and technical work.

It is built with React, Vite, TypeScript, Express, PostgreSQL, Drizzle ORM,
OpenAI, Tailwind CSS, Radix UI, Replit, and the wider open-source JavaScript
ecosystem.

The workspace package metadata declares the project under the MIT License.

> Reality first. Organization second. Context always.
