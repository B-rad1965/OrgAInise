---
name: Replit Auth hook
description: useAuth() from @workspace/replit-auth-web is standalone fetch-based, not context-based.
---

## Rule
`useAuth()` from `@workspace/replit-auth-web` is a self-contained hook using `useState` + `useEffect` + `useCallback`. It calls `GET /api/auth/user` on mount. It does NOT use React Context.

**Why:** Designed to be callable anywhere without a provider. But this means each call site makes its own network request — calling it in multiple components (e.g. Layout + useSyncedStorage) causes multiple fetches per page load.

**How to apply:**
- Safe to call in any component without wrapping in a provider.
- Always initialises with `{ isLoading: true, isAuthenticated: false, user: null }`.
- Consider passing `isAuthenticated` as a prop rather than calling `useAuth()` in multiple places on the same page to avoid duplicate `/api/auth/user` fetches.
- `login()` and `logout()` are stable callbacks (safe as effect deps).
