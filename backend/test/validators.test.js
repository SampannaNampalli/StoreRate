import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PASSWORD_PATTERN, rules, validate } from '../src/validators/index.js';
import { ApiError } from '../src/utils/ApiError.js';

/**
 * Runs a rule chain against a request double and returns the field errors it
 * produced, so the assertions read like the API's own 400 responses.
 */
async function runRules(chains, req) {
  const request = { body: {}, query: {}, params: {}, headers: {}, ...req };
  for (const chain of [chains].flat()) {
    await chain.run(request);
  }

  let failure = null;
  validate(request, {}, (err) => {
    failure = err;
  });

  return {
    request,
    ok: !failure,
    errors: failure instanceof ApiError ? Object.fromEntries(failure.details.map((d) => [d.field, d.message])) : {},
  };
}

const VALID_NAME = 'Registration Test Person One';

describe('password policy', () => {
  it('accepts a password meeting every rule', () => {
    for (const good of ['Valid@2024', 'A!bcdefg', 'Str0ng#Passw0rd']) {
      assert.match(good, PASSWORD_PATTERN, good);
    }
  });

  it('rejects one missing a requirement', () => {
    const bad = {
      'no uppercase': 'lowercase@1',
      'no special character': 'NoSpecial123',
      'too short': 'Ab@1',
      'too long': `Ab@${'x'.repeat(20)}`,
      'contains whitespace': 'Has Space@1',
    };
    for (const [why, value] of Object.entries(bad)) {
      assert.doesNotMatch(value, PASSWORD_PATTERN, why);
    }
  });
});

describe('rules.idParam', () => {
  it('accepts a normal id and converts it to a number', async () => {
    const { ok, request } = await runRules(rules.idParam(), { params: { id: '42' } });
    assert.equal(ok, true);
    assert.equal(request.params.id, 42);
  });

  it('rejects an id above the int4 ceiling', async () => {
    // Passing this through made node-postgres raise 22003, which the API used
    // to report as a 500 instead of a 400.
    const { ok, errors } = await runRules(rules.idParam(), { params: { id: '99999999999999999999' } });
    assert.equal(ok, false);
    assert.equal(errors.id, 'Invalid id');
  });

  it('rejects zero, negatives, and non-numbers', async () => {
    for (const id of ['0', '-1', 'abc', '1.5', '']) {
      const { ok } = await runRules(rules.idParam(), { params: { id } });
      assert.equal(ok, false, `accepted ${JSON.stringify(id)}`);
    }
  });
});

describe('rules.ratingValue', () => {
  it('accepts 1 through 5', async () => {
    for (const rating of [1, 3, 5, '4']) {
      const { ok, request } = await runRules(rules.ratingValue(), { body: { rating } });
      assert.equal(ok, true, `rejected ${rating}`);
      assert.equal(typeof request.body.rating, 'number');
    }
  });

  it('rejects values outside the range', async () => {
    for (const rating of [0, 6, -1, 99]) {
      const { ok } = await runRules(rules.ratingValue(), { body: { rating } });
      assert.equal(ok, false, `accepted ${rating}`);
    }
  });

  it('rejects an array or object where a number belongs', async () => {
    // `[5]` stringifies to "5" and used to slip through into a SQL parameter.
    for (const rating of [[5], { value: 5 }, [1, 2]]) {
      const { ok } = await runRules(rules.ratingValue(), { body: { rating } });
      assert.equal(ok, false, `accepted ${JSON.stringify(rating)}`);
    }
  });
});

describe('rules.email', () => {
  it('accepts a valid address', async () => {
    const { ok } = await runRules(rules.email(), { body: { email: 'someone@example.com' } });
    assert.equal(ok, true);
  });

  it('preserves subaddressing instead of normalising it away', async () => {
    // normalizeEmail used to strip `+tag`, rewriting the address the user chose
    // and collapsing two distinct addresses onto one account.
    const { request } = await runRules(rules.email(), { body: { email: 'alice+shopping@gmail.com' } });
    assert.equal(request.body.email, 'alice+shopping@gmail.com');
  });

  it('preserves dots in a Gmail local part', async () => {
    const { request } = await runRules(rules.email(), { body: { email: 'first.last@gmail.com' } });
    assert.equal(request.body.email, 'first.last@gmail.com');
  });

  it('rejects malformed addresses and non-strings', async () => {
    for (const email of ['not-an-email', '@example.com', '', { $ne: null }, ['a@b.c']]) {
      const { ok } = await runRules(rules.email(), { body: { email } });
      assert.equal(ok, false, `accepted ${JSON.stringify(email)}`);
    }
  });
});

describe('rules.name', () => {
  it('enforces the 20 to 60 character range from the spec', async () => {
    assert.equal((await runRules(rules.name(), { body: { name: VALID_NAME } })).ok, true);
    assert.equal((await runRules(rules.name(), { body: { name: 'Too Short' } })).ok, false);
    assert.equal((await runRules(rules.name(), { body: { name: 'x'.repeat(61) } })).ok, false);
  });

  it('rejects a non-string', async () => {
    for (const name of [{ length: 30 }, ['a'.repeat(30)], 12345]) {
      assert.equal((await runRules(rules.name(), { body: { name } })).ok, false, JSON.stringify(name));
    }
  });
});

describe('rules.pagination', () => {
  it('accepts sane values and converts them', async () => {
    const { ok, request } = await runRules(rules.pagination(), { query: { page: '2', limit: '50', sortOrder: 'desc' } });
    assert.equal(ok, true);
    assert.equal(request.query.page, 2);
    assert.equal(request.query.limit, 50);
  });

  it('rejects a limit past the ceiling and a bogus sort order', async () => {
    assert.equal((await runRules(rules.pagination(), { query: { limit: '5000' } })).ok, false);
    assert.equal((await runRules(rules.pagination(), { query: { sortOrder: 'sideways' } })).ok, false);
  });

  it('treats every parameter as optional', async () => {
    assert.equal((await runRules(rules.pagination(), { query: {} })).ok, true);
  });
});

describe('rules.filterTerm', () => {
  it('accepts a term and trims it', async () => {
    const { ok, request } = await runRules(rules.filterTerm('name'), { query: { name: '  aarav ' } });
    assert.equal(ok, true);
    assert.equal(request.query.name, 'aarav');
  });

  it('rejects a term long enough to be a payload', async () => {
    assert.equal((await runRules(rules.filterTerm('name'), { query: { name: 'x'.repeat(256) } })).ok, false);
  });
});
