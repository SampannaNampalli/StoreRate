import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../utils/logger.js';

export function notFoundHandler(req, res) {
  res.status(404).json({ message: `Route ${req.method} ${req.originalUrl} not found` });
}

/**
 * Errors raised by body-parser before any route runs. Left untranslated these
 * all surfaced as 500s, which tells a client its own malformed request was a
 * server fault and puts ordinary bad input into the alerting stream.
 */
const BODY_PARSER_STATUS = {
  'entity.too.large': [413, 'Request body is too large'],
  'entity.parse.failed': [400, 'Request body is not valid JSON'],
  'encoding.unsupported': [415, 'Unsupported content encoding'],
  'request.aborted': [400, 'Request aborted before it was fully received'],
  'request.size.invalid': [400, 'Content-Length did not match the request body'],
  'parameters.too.many': [413, 'Too many parameters in the request body'],
};

/**
 * PostgreSQL SQLSTATEs that describe the *caller's* input rather than a fault in
 * the service. `22003` and `22P02` in particular were reachable from the public
 * API - an id larger than an int4, or a JSON array where a number belongs - and
 * both produced a 500.
 */
const PG_STATUS = {
  '23505': [409, 'A record with that value already exists'],
  '23514': [400, 'A value failed a database validation rule'],
  '23503': [400, 'Referenced record does not exist'],
  '23502': [400, 'A required value was missing'],
  '22001': [400, 'A value is longer than the field allows'],
  '22003': [400, 'A numeric value is out of range'],
  '22007': [400, 'A date or time value is not valid'],
  '22P02': [400, 'A value is not in the expected format'],
  '40001': [409, 'The request conflicted with a concurrent change. Please retry.'],
  '40P01': [409, 'The request conflicted with a concurrent change. Please retry.'],
};

/** Database is unreachable, overloaded, or cut the statement off. */
const PG_UNAVAILABLE = new Set(['53300', '53400', '57014', '57P01', '57P03', '08000', '08003', '08006', '08001', '08004']);

function classify(err) {
  if (err instanceof ApiError) {
    return { status: err.status, body: { message: err.message, ...(err.details && { errors: err.details }) } };
  }

  const parser = BODY_PARSER_STATUS[err.type];
  if (parser) {
    return { status: parser[0], body: { message: parser[1] } };
  }

  // express.json surfaces malformed JSON as a SyntaxError carrying the raw body.
  if (err instanceof SyntaxError && 'body' in err) {
    return { status: 400, body: { message: 'Request body is not valid JSON' } };
  }

  const pg = PG_STATUS[err.code];
  if (pg) {
    return { status: pg[0], body: { message: pg[1] } };
  }

  if (PG_UNAVAILABLE.has(err.code) || err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT') {
    return { status: 503, body: { message: 'Service temporarily unavailable. Please try again.' } };
  }

  return { status: 500, body: { message: 'Internal server error' } };
}

export function errorHandler(err, req, res, _next) {
  const { status, body } = classify(err);

  // Logged before anything returns. Previously the database-constraint branches
  // returned above the log line, so the errors most likely to indicate a real
  // bug were the ones that never appeared in the logs at all.
  const context = { method: req.method, path: req.originalUrl, status, requestId: req.id };

  if (status >= 500) {
    logger.error('request_failed', context, err);
  } else if (!env.isProduction) {
    // Ordinary 4xx traffic is not an incident; useful while developing, noise
    // in a production log.
    logger.warn('request_rejected', { ...context, reason: err.message });
  }

  if (res.headersSent) {
    // Something already started writing; the only safe move is to cut the
    // response off rather than append a second set of headers to it.
    return res.destroy();
  }

  res.status(status).json({
    ...body,
    ...(req.id && { requestId: req.id }),
    // Never in production: `err.message` can carry SQL text, file paths, and
    // connection details.
    ...(!env.isProduction && status >= 500 && { detail: err.message }),
  });
}
