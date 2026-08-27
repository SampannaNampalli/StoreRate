import crypto from 'node:crypto';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import { env } from './config/env.js';
import routes from './routes/index.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { accessLogFormat } from './utils/logger.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

/** Only a value we could have generated ourselves is echoed back into the logs. */
const SAFE_REQUEST_ID = /^[A-Za-z0-9_.-]{1,64}$/;

function requestId(req, res, next) {
  const supplied = req.get('x-request-id');
  req.id = supplied && SAFE_REQUEST_ID.test(supplied) ? supplied : crypto.randomUUID();
  res.set('X-Request-Id', req.id);
  next();
}

export function createApp() {
  const app = express();

  // Behind a load balancer, req.ip is the proxy's address unless the forwarded
  // headers are trusted - which would make every client share one rate-limit
  // bucket. A hop count rather than `true`: trusting the whole chain lets a
  // client prepend addresses to X-Forwarded-For and pick its own identity.
  app.set('trust proxy', env.trustProxy);
  app.disable('x-powered-by');

  app.use(requestId);

  // The access log goes first, ahead of every middleware that can reject a
  // request. Registered after the body parser instead, a malformed JSON body
  // fails during parsing and the request never reaches morgan at all - so the
  // requests most worth noticing are the ones missing from the log.
  if (!env.isTest) {
    // One JSON object per request in production so the log is queryable;
    // morgan's terse `dev` colouring the rest of the time.
    app.use(
      morgan(env.isProduction ? accessLogFormat : 'dev', {
        // Liveness probes fire every few seconds and say nothing.
        //
        // `originalUrl`, not `req.path`: morgan decides this on the response's
        // `finish` event, which fires inside the mounted router while express
        // still has `req.url` stripped down to '/health'. `originalUrl` is the
        // one value that survives the rewrite.
        skip: (req) => req.originalUrl.split('?')[0] === '/api/health',
      }),
    );
  }

  app.use(helmet());

  // Ahead of the rate limiter, so a throttled browser can actually read the 429
  // instead of seeing it as an opaque CORS failure.
  app.use(cors({ origin: env.corsOrigin, credentials: true }));

  // A ceiling for every caller, before the body is parsed: a client over its
  // budget is turned away without the server spending anything on its payload.
  // Individual routes add tighter limits of their own.
  app.use(apiLimiter);

  app.use(
    compression({
      // Responses that carry a token are left uncompressed. Compressing a
      // secret alongside caller-influenced text is the shape BREACH attacks
      // exploit, and the auth responses are small enough that compressing them
      // buys nothing anyway.
      filter: (req, res) => !req.path.startsWith('/api/auth') && compression.filter(req, res),
    }),
  );

  app.use(express.json({ limit: env.requestBodyLimit }));
  app.use(express.urlencoded({ extended: true, limit: env.requestBodyLimit, parameterLimit: 100 }));

  app.use('/api', routes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
