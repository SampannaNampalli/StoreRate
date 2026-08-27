/**
 * Password hashing.
 *
 * bcryptjs is a pure-JavaScript implementation, so every hash and every
 * comparison burns CPU on the single main thread. Under concurrent logins that
 * starves the event loop and unrelated requests queue behind the hashing -
 * an unauthenticated caller can degrade the whole API just by failing to log in.
 *
 * Node's built-in scrypt does the same work in native code on the libuv thread
 * pool, so the main thread stays free to serve everything else. It needs no
 * native module to install and it is the memory-hard KDF recommended for new
 * password storage.
 *
 * Hashes made before this switch are still bcrypt. They keep verifying, and
 * `needsRehash` lets the login path transparently upgrade an account the next
 * time its owner successfully signs in.
 */
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';

const scrypt = promisify(crypto.scrypt);

const SCHEME = 'scrypt';
const SALT_BYTES = 16;

/** Serialised as `scrypt$N$r$p$salt$key`, all parameters recorded alongside the hash. */
function encode({ cost, blockSize, parallelization, salt, key }) {
  return [SCHEME, cost, blockSize, parallelization, salt.toString('base64'), key.toString('base64')].join('$');
}

function decode(stored) {
  const parts = String(stored).split('$');
  if (parts.length !== 6 || parts[0] !== SCHEME) return null;

  const [, cost, blockSize, parallelization, salt, key] = parts;
  const params = {
    cost: Number.parseInt(cost, 10),
    blockSize: Number.parseInt(blockSize, 10),
    parallelization: Number.parseInt(parallelization, 10),
  };

  if (!Object.values(params).every(Number.isInteger)) return null;

  return { ...params, salt: Buffer.from(salt, 'base64'), key: Buffer.from(key, 'base64') };
}

function isBcrypt(stored) {
  return /^\$2[aby]?\$/.test(String(stored));
}

/**
 * scrypt needs `128 * N * r` bytes; Node's default `maxmem` is exactly 32 MiB,
 * which the default parameters sit right on top of. Ask for headroom explicitly
 * instead of tuning the cost down to fit.
 */
function maxmemFor({ cost, blockSize }) {
  return 256 * cost * blockSize;
}

function derive(plain, { cost, blockSize, parallelization, salt, keyLength }) {
  return scrypt(plain, salt, keyLength, {
    N: cost,
    r: blockSize,
    p: parallelization,
    maxmem: maxmemFor({ cost, blockSize }),
  });
}

export async function hashPassword(plain) {
  const { cost, blockSize, parallelization, keyLength } = env.scrypt;
  const salt = crypto.randomBytes(SALT_BYTES);
  const key = await derive(plain, { cost, blockSize, parallelization, salt, keyLength });
  return encode({ cost, blockSize, parallelization, salt, key });
}

export async function verifyPassword(plain, stored) {
  if (typeof plain !== 'string' || !stored) return false;

  if (isBcrypt(stored)) {
    return bcrypt.compare(plain, stored);
  }

  const params = decode(stored);
  if (!params) return false;

  let derived;
  try {
    derived = await derive(plain, { ...params, keyLength: params.key.length });
  } catch {
    // Stored parameters outside what this process will allocate.
    return false;
  }

  // Constant-time: a byte-by-byte early exit would leak how much of the derived
  // key matched.
  return derived.length === params.key.length && crypto.timingSafeEqual(derived, params.key);
}

/** True when the stored hash is legacy bcrypt or was made with weaker parameters. */
export function needsRehash(stored) {
  if (isBcrypt(stored)) return true;

  const params = decode(stored);
  if (!params) return true;

  return (
    params.cost < env.scrypt.cost ||
    params.blockSize < env.scrypt.blockSize ||
    params.key.length < env.scrypt.keyLength
  );
}

/**
 * A hash of an unguessable value, used to spend the same CPU on a login for an
 * address that has no account as on one that does. Without it the endpoint
 * answers "no such user" far faster than "wrong password" and the timing gap
 * enumerates registered emails - which is exactly what the shared error message
 * on that route exists to prevent.
 *
 * Computed once, lazily, so it costs one hash per process rather than one per
 * failed login.
 */
let dummyHashPromise = null;

export function dummyHash() {
  dummyHashPromise ??= hashPassword(crypto.randomBytes(32).toString('base64'));
  return dummyHashPromise;
}

/** Burns the same work a real verification would, then reports failure. */
export async function verifyAgainstDummy(plain) {
  await verifyPassword(typeof plain === 'string' ? plain : '', await dummyHash());
  return false;
}
