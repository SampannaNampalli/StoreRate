/**
 * Versioned migration runner.
 *
 *   npm run db:migrate   -> apply every migration that has not run yet
 *   npm run db:reset     -> drop the public schema, then apply all of them
 *   npm run db:status    -> list applied and pending migrations, change nothing
 *
 * Files live in ./migrations and are applied in filename order. Each one runs
 * inside its own transaction and is recorded in `schema_migrations`, so a
 * partly-applied migration rolls back rather than leaving the schema in a state
 * no file describes.
 *
 * What this replaces: an all-or-nothing check for whether `users` existed. Once
 * it did, `db:migrate` did nothing at all, and the only way to pick up a schema
 * change was `db:reset` - which drops every row in the database. That is not a
 * thing you can run against production, so the schema could not evolve.
 *
 * A checksum is stored with each applied version. Editing a migration after it
 * has run somewhere is what makes two environments silently diverge, so that is
 * reported as an error instead of ignored.
 */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { env } from '../config/env.js';
import { poolConfig } from '../config/db.js';

const { Client } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

/** Serialises concurrent runners - two instances booting at once must not both apply. */
const ADVISORY_LOCK_KEY = 4_120_251_017;

const args = new Set(process.argv.slice(2));
const fresh = args.has('--fresh');
const statusOnly = args.has('--status');

function log(message) {
  console.log(`[migrate] ${message}`);
}

async function loadMigrations() {
  const entries = await fs.readdir(MIGRATIONS_DIR);
  const files = entries.filter((name) => name.endsWith('.sql')).sort();

  return Promise.all(
    files.map(async (file) => {
      const sql = await fs.readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
      return {
        version: file.replace(/\.sql$/, ''),
        file,
        sql,
        checksum: crypto.createHash('sha256').update(sql).digest('hex'),
      };
    }),
  );
}

/**
 * Creates the database if it is missing. Only possible when connecting by
 * discrete host/user/database - a managed provider hands out a DATABASE_URL for
 * a database it has already provisioned, and usually forbids CREATE DATABASE.
 */
async function ensureDatabaseExists() {
  if (env.db.connectionString) {
    log('DATABASE_URL is set - assuming the database already exists');
    return;
  }

  const client = new Client(poolConfig({ database: 'postgres' }));
  await client.connect();
  try {
    const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [
      env.db.database,
    ]);
    if (rowCount === 0) {
      // An identifier cannot be parameterised; env.db.database is operator-supplied config.
      await client.query(`CREATE DATABASE "${env.db.database.replace(/"/g, '""')}"`);
      log(`created database "${env.db.database}"`);
    } else {
      log(`database "${env.db.database}" already exists`);
    }
  } finally {
    await client.end();
  }
}

async function ensureLedger(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    TEXT        PRIMARY KEY,
      checksum   TEXT        NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

/**
 * A database created by the previous runner has the tables but no ledger. It is
 * already at 001, so record that rather than trying to re-run CREATE TABLE
 * against tables that exist.
 */
async function baselineExistingSchema(client, migrations) {
  const { rows } = await client.query("SELECT to_regclass('public.users') IS NOT NULL AS present");
  if (!rows[0].present) return;

  const initial = migrations[0];
  await client.query(
    'INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [initial.version, initial.checksum],
  );
  log(`adopted an existing database - baselined at ${initial.version}`);
}

async function applied(client) {
  const { rows } = await client.query('SELECT version, checksum FROM schema_migrations');
  return new Map(rows.map((row) => [row.version, row.checksum]));
}

function reportDrift(migrations, appliedMap) {
  const drifted = migrations.filter(
    (m) => appliedMap.has(m.version) && appliedMap.get(m.version) !== m.checksum,
  );
  if (drifted.length === 0) return;

  throw new Error(
    [
      'these migrations changed after they were applied:',
      ...drifted.map((m) => `  - ${m.file}`),
      'Applied migrations are immutable. Add a new migration for the change instead.',
    ].join('\n'),
  );
}

async function run() {
  const migrations = await loadMigrations();
  if (migrations.length === 0) throw new Error(`no .sql files in ${MIGRATIONS_DIR}`);

  await ensureDatabaseExists();

  // Building an index over a large table can take longer than the API's
  // per-statement budget; a migration is not a request and must not be cut off.
  const client = new Client(poolConfig({ statement_timeout: 0, query_timeout: undefined }));
  await client.connect();

  try {
    await client.query('SELECT pg_advisory_lock($1)', [ADVISORY_LOCK_KEY]);

    if (fresh) {
      await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
      log('dropped and recreated schema "public"');
    }

    await ensureLedger(client);
    if (!fresh) await baselineExistingSchema(client, migrations);

    const appliedMap = await applied(client);
    reportDrift(migrations, appliedMap);

    const pending = migrations.filter((m) => !appliedMap.has(m.version));

    if (statusOnly) {
      for (const m of migrations) {
        log(`${appliedMap.has(m.version) ? 'applied' : 'pending'}  ${m.file}`);
      }
      return;
    }

    if (pending.length === 0) {
      log(`up to date - ${appliedMap.size} migration(s) applied`);
      return;
    }

    for (const migration of pending) {
      await client.query('BEGIN');
      try {
        await client.query(migration.sql);
        await client.query('INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)', [
          migration.version,
          migration.checksum,
        ]);
        await client.query('COMMIT');
        log(`applied ${migration.file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`${migration.file} failed and was rolled back: ${err.message}`, { cause: err });
      }
    }

    log(`done - ${pending.length} migration(s) applied`);
  } finally {
    // Releasing the advisory lock is implicit on disconnect, but being explicit
    // keeps the intent readable.
    await client.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_KEY]).catch(() => {});
    await client.end();
  }
}

try {
  await run();
  process.exit(0);
} catch (err) {
  console.error(`[migrate] failed: ${err.message}`);
  process.exit(1);
}
