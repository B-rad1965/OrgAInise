---
name: Express typed params
description: @types/express types req.params values as string|string[], breaking Drizzle eq() overloads.
---

## Rule
In Express 5 with modern `@types/express`, `req.params.id` is typed as `string | string[]`, not `string`. Drizzle's `eq()` only accepts `string`, so passing `req.params.id` directly causes a TS overload resolution failure.

**Why:** @types/express uses a generic default that allows array values.

**How to apply:**
Use typed param generics on the handler:
```typescript
router.get("/:projectId", async (req: Request<{ projectId: string }>, res) => {
  const { projectId } = req.params; // now typed as string
});
```
Alternative: `const id = req.params.id as string;` — works but the generic approach is cleaner.
