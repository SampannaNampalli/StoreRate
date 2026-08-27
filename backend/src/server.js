import { createApp } from './app.js';
import { env } from './config/env.js';
import { assertDatabaseReachable, pool } from './config/db.js';
import { logger } from './utils/logger.js';

const app = createApp();

const server = app.listen(env.port, () => {
  logger.info('server_listening', { port: env.port, env: env.nodeEnv });
});

/**
 * Node closes an idle keep-alive connection after 5 seconds by default. A load
 * balancer that holds connections open longer than that will sometimes reuse
 * one in the instant the server is tearing it down, which surfaces to callers
 * as a sporadic ECONNRESET on a request that was never actually served. Keeping
 * the server's idle window wider than the proxy's means the proxy is always the
 * side that closes first.
 */
server.keepAliveTimeout = 65_000;
// Must exceed keepAliveTimeout, or the header timer fires during the keep-alive wait.
server.headersTimeout = 70_000;
// A caller that opens a connection and dribbles bytes cannot hold a socket open
// indefinitely.
server.requestTimeout = 60_000;

server.on('error', (err) => {
  logger.error('server_start_failed', { port: env.port, code: err.code }, err);
  process.exit(1);
});

// Confirm the database is actually reachable rather than discovering it on the
// first request. Not fatal: a database that is still starting up is a normal
// state during a deploy, and /api/ready reports the truth until it recovers.
assertDatabaseReachable()
  .then(({ db }) => {
    logger.info('database_connected', { database: db });
  })
  .catch((err) => {
    logger.error('database_unreachable', { note: '/api/ready will report this until it recovers' }, err);
  });

let shuttingDown = false;

async function shutdown(signal, { exitCode = 0 } = {}) {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info('shutdown_started', { signal });

  // A connection that is idle between keep-alive requests will never end on its
  // own, so `server.close` alone can hang until the orchestrator's SIGKILL.
  // This bounds the wait and makes the shutdown deterministic.
  const forced = setTimeout(() => {
    logger.error('shutdown_forced', { timeoutMs: env.shutdownTimeoutMs });
    process.exit(exitCode || 1);
  }, env.shutdownTimeoutMs);
  forced.unref();

  server.closeIdleConnections?.();

  await new Promise((resolve) => server.close(resolve));

  try {
    await pool.end();
  } catch (err) {
    logger.error('pool_close_failed', {}, err);
  }

  clearTimeout(forced);
  process.exit(exitCode);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

/**
 * After an uncaught exception the process state is unknown - a request may have
 * been abandoned midway through, holding a transaction or a half-written
 * response. Log it, stop accepting new work, and let the supervisor start a
 * clean process. Staying up and continuing to serve from an unknown state is
 * the more dangerous option.
 */
process.on('uncaughtException', (err) => {
  logger.error('uncaught_exception', {}, err);
  shutdown('uncaughtException', { exitCode: 1 });
});

process.on('unhandledRejection', (reason) => {
  logger.error('unhandled_rejection', {}, reason);
  shutdown('unhandledRejection', { exitCode: 1 });
});
