/**
 * Configuration, resolved once at boot.
 *
 * The guiding rule: the process must never start in production with a secret
 * that someone could read out of this repository. Anything missing or obviously
 * weak is a hard failure here rather than a silent fallback, so a
 * misconfiguration shows up as a refusal to boot instead of as an authentication
 * bypass discovered later.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

dotenv.config();

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';
const isTest = nodeEnv === 'test';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DEV_SECRET_FILE = path.join(backendRoot, '.dev-secret');

/** Placeholder values that have been published in this repo or its docs. */
const KNOWN_WEAK_SECRETS = new Set([
  'insecure-dev-secret-change-me',
  'change-me-to-a-long-random-string',
  'secret',
  'changeme',
  'jwt-secret',
]);

const MIN_SECRET_LENGTH = 32;

const problems = [];

function fail(message) {
  problems.push(message);
}

/**
 * A stable per-machine development secret. Generated on first run and kept out
 * of version control, so a fresh clone never shares a signing key with anyone
 * else and `node --watch` restarts do not invalidate the token in your browser.
 */
function developmentSecret() {
  try {
    const existing = fs.readFileSync(DEV_SECRET_FILE, 'utf8').trim();
    if (existing.length >= MIN_SECRET_LENGTH) return existing;
  } catch {
    // Not created yet - fall through and write one.
  }

  const generated = crypto.randomBytes(48).toString('base64url');
  try {
    fs.writeFileSync(DEV_SECRET_FILE, `${generated}\n`, { mode: 0o600 });
    // eslint-disable-next-line no-console
    console.warn(
      `[env] JWT_SECRET is not set. Generated a local development secret at ${DEV_SECRET_FILE}. ` +
        'Set JWT_SECRET explicitly before deploying.',
    );
  } catch {
    // Read-only filesystem: fall back to a per-boot secret. Tokens will not
    // survive a restart, which is inconvenient but never insecure.
    // eslint-disable-next-line no-console
    console.warn('[env] JWT_SECRET is not set and no dev secret could be stored - using a per-boot secret.');
  }
  return generated;
}

function resolveJwtSecret() {
  const value = process.env.JWT_SECRET;

  if (!value) {
    if (isProduction) {
      fail('JWT_SECRET is required in production. Generate one with: openssl rand -base64 48');
      return null;
    }
    return isTest ? crypto.randomBytes(48).toString('base64url') : developmentSecret();
  }

  if (KNOWN_WEAK_SECRETS.has(value.trim().toLowerCase())) {
    fail('JWT_SECRET is set to a placeholder value from the example config. Generate a real one.');
    return null;
  }

  if (value.length < MIN_SECRET_LENGTH) {
    fail(`JWT_SECRET must be at least ${MIN_SECRET_LENGTH} characters (got ${value.length}).`);
    return null;
  }

  return value;
}

function bool(value, fallback) {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function int(value, fallback, { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

/**
 * `DATABASE_URL` wins when present - that is the shape every managed Postgres
 * provider hands out. The discrete PG* variables remain for local development.
 */
const databaseUrl = process.env.DATABASE_URL || null;

/**
 * TLS for the database connection. Managed providers require it; a plain local
 * Postgres does not offer it at all. Defaults to on whenever a DATABASE_URL is
 * used, off otherwise, and is overridable either way.
 *
 * `PGSSLMODE=no-verify` (or DATABASE_SSL_REJECT_UNAUTHORIZED=false) allows the
 * provider-signed certificates that are not in Node's trust store. Prefer
 * supplying the provider CA through PGSSLROOTCERT instead.
 */
function resolveSsl() {
  const mode = (process.env.PGSSLMODE || '').trim().toLowerCase();
  if (mode === 'disable') return false;

  const enabled = bool(process.env.DATABASE_SSL, Boolean(databaseUrl) || mode !== '');
  if (!enabled) return false;

  const caPath = process.env.PGSSLROOTCERT;
  let ca;
  if (caPath) {
    try {
      ca = fs.readFileSync(caPath, 'utf8');
    } catch (err) {
      fail(`PGSSLROOTCERT points at ${caPath} which could not be read: ${err.message}`);
    }
  }

  const rejectUnauthorized = ca
    ? true
    : bool(process.env.DATABASE_SSL_REJECT_UNAUTHORIZED, mode !== 'no-verify' && mode !== 'require');

  if (isProduction && !rejectUnauthorized && !ca) {
    // eslint-disable-next-line no-console
    console.warn(
      '[env] database TLS certificate verification is disabled. Set PGSSLROOTCERT to your ' +
        "provider's CA bundle to enable it.",
    );
  }

  return { rejectUnauthorized, ...(ca && { ca }) };
}

/** Comma-separated list, so staging and production hostnames can coexist. */
const corsOrigin = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

if (isProduction && corsOrigin.some((origin) => origin === '*')) {
  fail('CORS_ORIGIN must name explicit origins in production, not "*".');
}

const jwtSecret = resolveJwtSecret();

// Not validated here: seeding is a separate command and the API never needs it.
// seed.js refuses to run without an explicit password.
const seedAdminPassword = process.env.SEED_ADMIN_PASSWORD || null;

if (problems.length > 0) {
  // eslint-disable-next-line no-console
  console.error(
    ['[env] refusing to start - fix the following configuration problems:', ...problems.map((p) => `  - ${p}`)].join(
      '\n',
    ),
  );
  process.exit(1);
}

export const env = {
  port: int(process.env.PORT, 4000, { min: 0, max: 65535 }),
  nodeEnv,
  isProduction,
  isTest,
  corsOrigin,

  /**
   * How many reverse proxies sit in front of this process. Required for the
   * rate limiter and the access log to see the real client IP, and deliberately
   * a number rather than `true` so a spoofed X-Forwarded-For cannot lengthen
   * the chain and hide behind an invented hop.
   */
  trustProxy: int(process.env.TRUST_PROXY_HOPS, 0, { min: 0, max: 10 }),

  db: {
    connectionString: databaseUrl,
    host: process.env.PGHOST || 'localhost',
    port: int(process.env.PGPORT, 5432, { min: 1, max: 65535 }),
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || 'postgres',
    database: process.env.PGDATABASE || 'store_ratings',
    ssl: resolveSsl(),
    poolMax: int(process.env.PGPOOL_MAX, 10, { min: 1, max: 200 }),
    idleTimeoutMillis: int(process.env.PGPOOL_IDLE_TIMEOUT_MS, 30_000, { min: 1_000 }),
    connectionTimeoutMillis: int(process.env.PGPOOL_CONNECT_TIMEOUT_MS, 10_000, { min: 1_000 }),
    statementTimeoutMillis: int(process.env.PG_STATEMENT_TIMEOUT_MS, 15_000, { min: 1_000 }),
  },

  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',

  /**
   * scrypt work factors. `cost` is the N parameter and must be a power of two;
   * 2^15 with r=8 costs roughly 32 MB and ~100 ms per hash on a modern core.
   */
  scrypt: {
    cost: 2 ** int(process.env.SCRYPT_COST_LOG2, 15, { min: 12, max: 20 }),
    blockSize: int(process.env.SCRYPT_BLOCK_SIZE, 8, { min: 1, max: 32 }),
    parallelization: int(process.env.SCRYPT_PARALLELIZATION, 1, { min: 1, max: 8 }),
    keyLength: 64,
  },

  /** Retained only to verify password hashes created before the scrypt switch. */
  bcryptRounds: int(process.env.BCRYPT_ROUNDS, 10, { min: 4, max: 15 }),

  rateLimit: {
    windowMs: int(process.env.RATE_LIMIT_WINDOW_MS, 15 * 60_000, { min: 1_000 }),
    max: int(process.env.RATE_LIMIT_MAX, 600, { min: 1 }),
    authWindowMs: int(process.env.AUTH_RATE_LIMIT_WINDOW_MS, 15 * 60_000, { min: 1_000 }),
    authMax: int(process.env.AUTH_RATE_LIMIT_MAX, 10, { min: 1 }),
    // Signups get their own budget: a person legitimately failing ten logins
    // in a quarter hour is rare, while a household or office behind one
    // address creating several accounts is not.
    registerMax: int(process.env.REGISTER_RATE_LIMIT_MAX, 20, { min: 1 }),
    writeMax: int(process.env.WRITE_RATE_LIMIT_MAX, 60, { min: 1 }),
    /** Lets the smoke test and load probes opt out without weakening real deployments. */
    disabled: bool(process.env.RATE_LIMIT_DISABLED, false) && !isProduction,
  },

  requestBodyLimit: process.env.REQUEST_BODY_LIMIT || '100kb',
  shutdownTimeoutMs: int(process.env.SHUTDOWN_TIMEOUT_MS, 10_000, { min: 1_000 }),

  seedAdminEmail: process.env.SEED_ADMIN_EMAIL || 'admin@storerate.com',
  seedAdminPassword,
};
