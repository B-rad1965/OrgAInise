import type { NextFunction, Request, Response } from "express";

const WINDOW_MS = 15 * 60 * 1000;
const ANONYMOUS_LIMIT = 10;
const AUTHENTICATED_LIMIT = 60;
const MAX_TRACKED_CLIENTS = 10_000;

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const clients = new Map<string, RateLimitEntry>();
let nextSweepAt = 0;

function sweepExpired(now: number): void {
  if (now < nextSweepAt && clients.size < MAX_TRACKED_CLIENTS) return;
  for (const [key, entry] of clients) {
    if (entry.resetAt <= now) clients.delete(key);
  }
  nextSweepAt = now + 60_000;
}

export function aiRateLimit(req: Request, res: Response, next: NextFunction): void {
  const now = Date.now();
  sweepExpired(now);

  const authenticated = req.isAuthenticated();
  const limit = authenticated ? AUTHENTICATED_LIMIT : ANONYMOUS_LIMIT;
  const key = authenticated ? `user:${req.user.id}` : `ip:${req.ip ?? "unknown"}`;
  let entry = clients.get(key);

  if (!entry || entry.resetAt <= now) {
    if (clients.size >= MAX_TRACKED_CLIENTS) {
      res.setHeader("Retry-After", "60");
      res.status(429).json({ error: "AI service is temporarily busy. Please try again shortly." });
      return;
    }
    entry = { count: 0, resetAt: now + WINDOW_MS };
    clients.set(key, entry);
  }

  const resetSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
  const remaining = Math.max(0, limit - entry.count - 1);
  res.setHeader("RateLimit-Limit", String(limit));
  res.setHeader("RateLimit-Remaining", String(remaining));
  res.setHeader("RateLimit-Reset", String(resetSeconds));

  if (entry.count >= limit) {
    res.setHeader("Retry-After", String(resetSeconds));
    req.log.warn({ authenticated, retryAfterSeconds: resetSeconds }, "AI rate limit exceeded");
    res.status(429).json({
      error: `AI request limit reached. Please try again in ${resetSeconds} seconds.`,
    });
    return;
  }

  entry.count += 1;
  next();
}
