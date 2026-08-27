/**
 * Logging.
 *
 * In production every line is a single JSON object, so a log aggregator can
 * filter on level, event name, status or request id without anyone writing a
 * regex against prose. In development the same calls print as readable text,
 * because a JSON blob per request is miserable to work with in a terminal.
 *
 * Deliberately a thin wrapper over `console`: stdout and stderr are the process
 * boundary, and whatever runs the container is responsible for shipping them.
 * Nothing here opens a file, buffers, or blocks.
 */
import { env } from '../config/env.js';

/** Field names whose values must never reach a log line. */
const REDACTED = new Set(['password', 'currentpassword', 'newpassword', 'token', 'authorization', 'password_hash']);

function scrub(fields) {
  const safe = {};
  for (const [key, value] of Object.entries(fields)) {
    safe[key] = REDACTED.has(key.toLowerCase()) ? '[redacted]' : value;
  }
  return safe;
}

/** Errors do not survive JSON.stringify - pull out the parts worth keeping. */
function describeError(err) {
  if (!(err instanceof Error)) return err === undefined ? undefined : { value: String(err) };
  return {
    name: err.name,
    message: err.message,
    ...(err.code && { code: err.code }),
    // A stack is noise in production logs for handled errors, but it is the
    // only useful part of an unexpected one.
    ...(err.stack && { stack: err.stack.split('\n').slice(0, 8).join('\n') }),
  };
}

function emit(level, event, fields = {}, err) {
  const method = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log';

  if (env.isProduction) {
    // eslint-disable-next-line no-console
    console[method](
      JSON.stringify({
        ts: new Date().toISOString(),
        level,
        event,
        ...scrub(fields),
        ...(err !== undefined && { err: describeError(err) }),
      }),
    );
    return;
  }

  const detail = Object.entries(scrub(fields))
    .map(([key, value]) => `${key}=${typeof value === 'string' ? value : JSON.stringify(value)}`)
    .join(' ');

  // eslint-disable-next-line no-console
  console[method](`[${level}] ${event}${detail ? ` ${detail}` : ''}`, ...(err === undefined ? [] : [err]));
}

export const logger = {
  info: (event, fields) => emit('info', event, fields),
  warn: (event, fields, err) => emit('warn', event, fields, err),
  error: (event, fields, err) => emit('error', event, fields, err),
};

/**
 * morgan format. One JSON object per request in production; morgan's terse
 * `dev` colouring everywhere else.
 */
export function accessLogFormat(tokens, req, res) {
  if (!env.isProduction) return null;

  return JSON.stringify({
    ts: new Date().toISOString(),
    level: 'info',
    event: 'request',
    method: tokens.method(req, res),
    path: tokens.url(req, res),
    status: Number(tokens.status(req, res)),
    durationMs: Number(tokens['response-time'](req, res)),
    length: Number(tokens.res(req, res, 'content-length')) || 0,
    ip: req.ip,
    requestId: req.id,
    userId: req.user?.id,
  });
}
