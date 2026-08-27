import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import bcrypt from 'bcryptjs';
import { hashPassword, needsRehash, verifyAgainstDummy, verifyPassword } from '../src/utils/password.js';

describe('password hashing', () => {
  it('round-trips a password', async () => {
    const hash = await hashPassword('Correct@2024');
    assert.ok(hash.startsWith('scrypt$'), `expected a scrypt hash, got ${hash.slice(0, 12)}`);
    assert.equal(await verifyPassword('Correct@2024', hash), true);
  });

  it('rejects the wrong password', async () => {
    const hash = await hashPassword('Correct@2024');
    assert.equal(await verifyPassword('Wrong@2024', hash), false);
  });

  it('salts, so the same password hashes differently every time', async () => {
    const [a, b] = await Promise.all([hashPassword('Same@2024'), hashPassword('Same@2024')]);
    assert.notEqual(a, b);
    assert.equal(await verifyPassword('Same@2024', a), true);
    assert.equal(await verifyPassword('Same@2024', b), true);
  });

  it('still verifies bcrypt hashes written before the scrypt switch', async () => {
    const legacy = bcrypt.hashSync('Legacy@2024', 4);
    assert.equal(await verifyPassword('Legacy@2024', legacy), true);
    assert.equal(await verifyPassword('Wrong@2024', legacy), false);
  });

  it('flags legacy hashes for upgrade and leaves current ones alone', async () => {
    assert.equal(needsRehash(bcrypt.hashSync('Legacy@2024', 4)), true);
    assert.equal(needsRehash(await hashPassword('Current@2024')), false);
  });

  it('flags a hash made with weaker parameters', async () => {
    const current = await hashPassword('Current@2024');
    const [, , blockSize, parallelization, salt, key] = current.split('$');
    assert.equal(needsRehash(['scrypt', 4096, blockSize, parallelization, salt, key].join('$')), true);
  });

  it('treats malformed and empty stored hashes as non-matching', async () => {
    assert.equal(await verifyPassword('anything', 'not-a-hash'), false);
    assert.equal(await verifyPassword('anything', 'scrypt$1$2$3'), false);
    assert.equal(await verifyPassword('anything', ''), false);
    assert.equal(await verifyPassword('anything', null), false);
  });

  it('never matches a non-string candidate', async () => {
    const hash = await hashPassword('Correct@2024');
    assert.equal(await verifyPassword(undefined, hash), false);
    assert.equal(await verifyPassword({ toString: () => 'Correct@2024' }, hash), false);
  });

  it('the dummy comparison always fails but does the work', async () => {
    assert.equal(await verifyAgainstDummy('anything'), false);
    assert.equal(await verifyAgainstDummy(''), false);
  });
});
