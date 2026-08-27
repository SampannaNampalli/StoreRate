import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { errorHandler, notFoundHandler } from '../src/middleware/errorHandler.js';
import { ApiError } from '../src/utils/ApiError.js';

/** Minimal express req/res doubles - enough for the handler's actual surface. */
function fakeReq(overrides = {}) {
  return { method: 'GET', originalUrl: '/api/thing', id: 'req-1', ...overrides };
}

function fakeRes() {
  const res = {
    statusCode: null,
    body: null,
    headersSent: false,
    destroyed: false,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    destroy() {
      this.destroyed = true;
      return this;
    },
  };
  return res;
}

/** Runs the handler with console noise suppressed. */
function handle(err, req = fakeReq()) {
  const res = fakeRes();
  const error = mock.method(console, 'error', () => {});
  const warn = mock.method(console, 'warn', () => {});
  try {
    errorHandler(err, req, res, () => {});
  } finally {
    error.mock.restore();
    warn.mock.restore();
  }
  return res;
}

describe('notFoundHandler', () => {
  it('names the route that missed', () => {
    const res = fakeRes();
    notFoundHandler({ method: 'POST', originalUrl: '/api/nope' }, res);
    assert.equal(res.statusCode, 404);
    assert.match(res.body.message, /POST \/api\/nope/);
  });
});

describe('errorHandler', () => {
  it('passes an ApiError through with its status and details', () => {
    const details = [{ field: 'email', message: 'Enter a valid email address' }];
    const res = handle(ApiError.badRequest('Validation failed', details));
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.message, 'Validation failed');
    assert.deepEqual(res.body.errors, details);
  });

  it('maps body-parser failures to the caller, not the server', () => {
    // Every one of these used to be reported as a 500.
    const cases = [
      [{ type: 'entity.too.large' }, 413],
      [{ type: 'entity.parse.failed' }, 400],
      [{ type: 'encoding.unsupported' }, 415],
      [{ type: 'request.aborted' }, 400],
    ];
    for (const [err, expected] of cases) {
      assert.equal(handle(err).statusCode, expected, `for ${err.type}`);
    }
  });

  it('maps malformed JSON', () => {
    const err = new SyntaxError('Unexpected end of JSON input');
    err.body = '{"a":';
    const res = handle(err);
    assert.equal(res.statusCode, 400);
    assert.match(res.body.message, /not valid JSON/);
  });

  it('maps PostgreSQL states that describe bad input', () => {
    const cases = [
      ['23505', 409],
      ['23514', 400],
      ['23503', 400],
      ['23502', 400],
      ['22001', 400],
      ['22003', 400], // id larger than an int4
      ['22P02', 400], // array where a number belongs
      ['40001', 409],
    ];
    for (const [code, expected] of cases) {
      assert.equal(handle({ code }).statusCode, expected, `for SQLSTATE ${code}`);
    }
  });

  it('reports an unreachable database as unavailable, not as a bug', () => {
    for (const code of ['57014', '53300', '08006', 'ECONNREFUSED']) {
      assert.equal(handle({ code }).statusCode, 503, `for ${code}`);
    }
  });

  it('falls back to 500 for anything unrecognised', () => {
    const res = handle(new TypeError('x is not a function'));
    assert.equal(res.statusCode, 500);
    assert.equal(res.body.message, 'Internal server error');
  });

  it('echoes the request id so a report can be traced to a log line', () => {
    assert.equal(handle(ApiError.notFound()).body.requestId, 'req-1');
  });

  it('logs 5xx and stays quiet about ordinary 4xx traffic', () => {
    const error = mock.method(console, 'error', () => {});
    const warn = mock.method(console, 'warn', () => {});
    try {
      errorHandler(new Error('boom'), fakeReq(), fakeRes(), () => {});
      assert.equal(error.mock.callCount(), 1, '5xx should be logged as an error');

      error.mock.resetCalls();
      errorHandler(ApiError.notFound(), fakeReq(), fakeRes(), () => {});
      assert.equal(error.mock.callCount(), 0, '404 is not an error-level event');
    } finally {
      error.mock.restore();
      warn.mock.restore();
    }
  });

  it('cuts the response off rather than writing headers twice', () => {
    const res = fakeRes();
    res.headersSent = true;
    const error = mock.method(console, 'error', () => {});
    try {
      errorHandler(new Error('late failure'), fakeReq(), res, () => {});
    } finally {
      error.mock.restore();
    }
    assert.equal(res.destroyed, true);
    assert.equal(res.body, null);
  });
});
