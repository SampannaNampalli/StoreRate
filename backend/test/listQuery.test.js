import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolvePagination, resolveSort, WhereBuilder } from '../src/utils/listQuery.js';

const COLUMNS = { name: 'LOWER(u.name)', email: 'LOWER(u.email)', createdAt: 'u.created_at' };

describe('resolveSort', () => {
  it('resolves a whitelisted column', () => {
    const sort = resolveSort('email', 'desc', COLUMNS, 'name');
    assert.equal(sort.column, 'LOWER(u.email)');
    assert.equal(sort.direction, 'DESC');
    assert.equal(sort.key, 'email');
  });

  it('falls back when the column is not on the whitelist', () => {
    // The whole point: a sort column is interpolated into the SQL text, so a
    // value that is not on the list must never reach it.
    for (const attempt of ['u.password_hash', 'name); DROP TABLE users;--', '', null, undefined, 42]) {
      const sort = resolveSort(attempt, 'asc', COLUMNS, 'name');
      assert.equal(sort.column, 'LOWER(u.name)', `leaked for input ${JSON.stringify(attempt)}`);
    }
  });

  it('only ever emits ASC or DESC', () => {
    for (const attempt of ['desc', 'DESC', 'asc', 'nonsense', '; DROP TABLE users', null]) {
      const { direction } = resolveSort('name', attempt, COLUMNS, 'name');
      assert.ok(['ASC', 'DESC'].includes(direction), `got ${direction}`);
    }
  });
});

describe('resolvePagination', () => {
  it('defaults to the first page', () => {
    assert.deepEqual(resolvePagination({}), { page: 1, limit: 10, offset: 0 });
  });

  it('computes the offset', () => {
    assert.deepEqual(resolvePagination({ page: '3', limit: '25' }), { page: 3, limit: 25, offset: 50 });
  });

  it('clamps a limit above the maximum', () => {
    assert.equal(resolvePagination({ limit: '100000' }).limit, 100);
    assert.equal(resolvePagination({ limit: '100000' }, { maxLimit: 200 }).limit, 200);
  });

  it('refuses a zero or negative page and limit', () => {
    assert.deepEqual(resolvePagination({ page: '0', limit: '0' }), { page: 1, limit: 10, offset: 0 });
    assert.deepEqual(resolvePagination({ page: '-5', limit: '-5' }), { page: 1, limit: 1, offset: 0 });
  });

  it('ignores junk', () => {
    assert.deepEqual(resolvePagination({ page: 'abc', limit: 'xyz' }), { page: 1, limit: 10, offset: 0 });
  });
});

describe('WhereBuilder', () => {
  it('numbers placeholders in order', () => {
    const where = new WhereBuilder();
    where.add('u.role = $?', 'ADMIN').add('u.id > $?', 5);
    assert.equal(where.sql(), 'WHERE u.role = $1 AND u.id > $2');
    assert.deepEqual(where.values, ['ADMIN', 5]);
    assert.equal(where.nextIndex, 3);
  });

  it('returns an empty string when nothing was added', () => {
    assert.equal(new WhereBuilder().sql(), '');
  });

  it('skips blank filters entirely', () => {
    const where = new WhereBuilder();
    where.like('LOWER(u.name)', undefined).like('LOWER(u.email)', null).like('LOWER(u.address)', '   ');
    assert.equal(where.sql(), '');
    assert.deepEqual(where.values, []);
  });

  it('lower-cases and wraps a search term', () => {
    const where = new WhereBuilder();
    where.like('LOWER(u.name)', '  AaRaV  ');
    assert.match(where.sql(), /LOWER\(u\.name\) LIKE \$1 ESCAPE/);
    assert.deepEqual(where.values, ['%aarav%']);
  });

  it('escapes LIKE wildcards so they match literally', () => {
    // Unescaped, `%` matched every row - a filter that ignores its own input.
    const cases = [
      ['%', '%\\%%'],
      ['_', '%\\_%'],
      ['50%', '%50\\%%'],
      ['a_b%c', '%a\\_b\\%c%'],
    ];
    for (const [input, expected] of cases) {
      const where = new WhereBuilder();
      where.like('LOWER(u.name)', input);
      assert.deepEqual(where.values, [expected], `input ${JSON.stringify(input)}`);
    }
  });

  it('escapes the escape character itself', () => {
    const where = new WhereBuilder();
    where.like('LOWER(u.name)', '\\%');
    // A lone backslash must not be able to disarm the escaping that follows it.
    assert.deepEqual(where.values, ['%\\\\\\%%']);
  });
});
