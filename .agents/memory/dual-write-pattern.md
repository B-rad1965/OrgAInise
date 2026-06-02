---
name: Dual-write pattern
description: How OrgAInise syncs localStorage → PostgreSQL; constraints and key design decisions.
---

## Rule
localStorage is always written first (synchronous). DB calls are fire-and-forget (`void apiFetch(...)`). DB failures are caught and console.warn'd — they never throw or block the UI.

**Why:** "localStorage remains source of truth throughout V1" — users must never lose access even when offline or unauthenticated.

**How to apply:**
- Every write method in `synced-storage.ts` calls `Storage.saveX()` (sync) then `void dbSaveX()` (async) — always in that order.
- `apiFetch` wraps both network errors and non-2xx responses in try/catch and never re-throws.
- Initial login sync uses `POST /api/sync` (bulk upsert), not individual write calls.
- `sessionStorage.getItem("orgainise_db_synced") === "1"` prevents re-syncing on each page load.
- After successful initial sync, `window.dispatchEvent(new CustomEvent("orgainise:synced", { detail: {...counts} }))` is fired so Layout can show a toast.
- Users with no localStorage data → sync is skipped silently (no event, no toast).
