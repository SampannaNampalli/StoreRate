import pg from 'pg';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

const { Pool, types } = pg;

// node-postgres returns BIGINT and NUMERIC as strings to avoid precision loss.
// Counts and 1-5 rating averages are far inside the safe-integer range, so parse
// them into JS numbers and keep the JSON responses free of stringified numbers.
types.setTypeParser(types.builtins.INT8, (value) => Number.parseInt(value, 10));
types.setTypeParser(types.builtins.NUMERIC, (value) => Number.parseFloat(value));

/**
 * Connection settings. A `DATABASE_URL` - the shape every managed Postgres
 * provider hands out - takes precedence over the discrete PG* variables, and
 * TLS settings are applied either way.
 */
export function poolConfig(overrides = {}) {
  const base = env.db.connectionString
    ? { connectionString: env.db.connectionString }
    : {
        host: env.db.host,
        port: env.db.port,
        user: env.db.user,
        password: env.db.password,
        database: env.db.database,
      };

  return {
    ...base,
    ssl: env.db.ssl,
    // A query that never returns must not hold a pool slot forever; without
    // this, one pathological statement can starve every other request.
    statement_timeout: env.db.statementTimeoutMillis,
    query_timeout: env.db.statementTimeoutMillis,
    application_name: 'storerate-api',
    ...overrides,
  };
}

export const pool = new Pool({
  ...poolConfig(),
  max: env.db.poolMax,
  idleTimeoutMillis: env.db.idleTimeoutMillis,
  // Fail a checkout that cannot get a connection rather than queueing behind an
  // unreachable database until the client gives up.
  connectionTimeoutMillis: env.db.connectionTimeoutMillis,
});

pool.on('error', (err) => {
  // Fires for idle clients dropped by the server or the network. The pool
  // discards the client and carries on, so this is logged, not fatal.
  logger.error('db_idle_client_error', {}, err);
});

/** Run a parameterised query. Never interpolate user input into SQL text. */
export function query(text, params) {
  return pool.query(text, params);
}

/** Run a set of statements inside a single transaction. */
export async function withTransaction(fn) {
  const client = await pool.connect();
  // Set when ROLLBACK itself fails: the connection is then in an unknown state
  // and must be destroyed rather than handed back to the pool.
  let destroyReason = null;

  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      // The original error is what explains the failure - a broken connection
      // during cleanup must not replace it.
      logger.error('db_rollback_failed', {}, rollbackErr);
      destroyReason = rollbackErr;
    }
    throw err;
  } finally {
    client.release(destroyReason ?? undefined);
  }
}

/** Verifies the database is reachable before the server starts taking traffic. */
export async function assertDatabaseReachable() {
  const { rows } = await pool.query('SELECT current_database() AS db, version() AS version');
  return rows[0];
}
