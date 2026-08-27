/**
 * Request rate limiting.
 *
 * Three layers, because they defend against different things:
 *
 *   apiLimiter    - a broad ceiling per IP, so no single client can flood the API.
 *   loginLimiter  - failed credentials per IP. Successful logins are not counted,
 *                   so a busy office behind one NAT address is never locked out
 *                   by normal use, while guessing is throttled hard.
 *   accountLimiter- failed credentials per email address. Catches the same guess
 *                   attempt spread across many source IPs, which the per-IP
 *                   limiter alone cannot see.
 *   writeLimiter  - creates and updates, which cost database writes.
 *
 * The counters are in-process. That is correct for a single instance; running
 * several behind a load balancer needs a shared store (the `store` option takes
 * a Redis-backed one) or each instance will allow the full budget on its own.
 */
import { rateLimit } from 'express-rate-limit';
import { env } from '../config/env.js';

function build({ windowMs, max, message, ...options }) {
  return rateLimit({
    windowMs,
    limit: max,
    // RateLimit-* headers per the IETF draft; the older X-RateLimit-* set is
    // redundant once those are present.
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: () => env.rateLimit.disabled,
    handler: (req, res) => {
      const retryAfter = Math.ceil(windowMs / 1000);
      res.set('Retry-After', String(retryAfter));
      res.status(429).json({ message, retryAfter });
    },
    ...options,
  });
}

export const apiLimiter = build({
  windowMs: env.rateLimit.windowMs,
  max: env.rateLimit.max,
  message: 'Too many requests. Please slow down and try again shortly.',
});

export const loginLimiter = build({
  windowMs: env.rateLimit.authWindowMs,
  max: env.rateLimit.authMax,
  message: 'Too many failed sign-in attempts. Please try again later.',
  // Only wrong credentials count towards the budget.
  skipSuccessfulRequests: true,
});

function loginEmail(req) {
  return typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
}

export const accountLimiter = build({
  windowMs: env.rateLimit.authWindowMs,
  max: env.rateLimit.authMax,
  message: 'Too many failed sign-in attempts for this account. Please try again later.',
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `account:${loginEmail(req)}`,
  // Nothing to key on without an address, and bucketing those together would
  // mean one flood of malformed requests answering 429 where a 400 belongs.
  // Such requests are still counted by the per-IP limiter in front of this one.
  skip: (req) => env.rateLimit.disabled || loginEmail(req) === '',
});

export const registerLimiter = build({
  windowMs: env.rateLimit.authWindowMs,
  max: env.rateLimit.registerMax,
  message: 'Too many accounts created from this address. Please try again later.',
});

export const writeLimiter = build({
  windowMs: env.rateLimit.windowMs,
  max: env.rateLimit.writeMax,
  message: 'Too many changes submitted. Please slow down and try again shortly.',
});
