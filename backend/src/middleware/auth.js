import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { query } from '../config/db.js';
import { ApiError, asyncHandler } from '../utils/ApiError.js';

export const ROLES = Object.freeze({
  ADMIN: 'ADMIN',
  USER: 'USER',
  OWNER: 'OWNER',
});

/**
 * `issuedAt` pins the token's `iat` to a known second. Callers that have just
 * written `password_changed_at` pass the value the database returned, because
 * `authenticate` compares the two: letting the clock drift a fraction of a
 * second between the UPDATE and the signature would round `iat` down below the
 * change and reject the very token being handed out.
 */
export function signToken(user, { issuedAt } = {}) {
  return jwt.sign(
    { sub: user.id, role: user.role, ...(Number.isFinite(issuedAt) && { iat: issuedAt }) },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn },
  );
}

/** Seconds since the epoch, matching the resolution of a JWT `iat` claim. */
export function toIssuedAt(timestamp) {
  return Math.floor(new Date(timestamp).getTime() / 1000);
}

/** Verifies the bearer token and loads the current user onto `req.user`. */
export const authenticate = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    throw ApiError.unauthorized('Missing bearer token');
  }

  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret);
  } catch {
    throw ApiError.unauthorized('Invalid or expired token');
  }

  // Read the user back from the database so a role change or account deletion
  // takes effect immediately instead of waiting for the token to expire.
  const { rows } = await query(
    'SELECT id, name, email, address, role, password_changed_at FROM users WHERE id = $1',
    [payload.sub],
  );

  if (rows.length === 0) {
    throw ApiError.unauthorized('Account no longer exists');
  }

  const { password_changed_at: passwordChangedAt, ...user } = rows[0];

  // A JWT stays valid for its full lifetime once signed, so changing a password
  // would otherwise leave every session opened with the old one running for the
  // rest of the week - including whoever's access the change was meant to end.
  // `iat` is whole seconds, so compare at that resolution and let a token minted
  // in the same second as the change through: that is the replacement token
  // issued by the password change itself.
  if (Number.isFinite(payload.iat) && payload.iat < Math.floor(new Date(passwordChangedAt).getTime() / 1000)) {
    throw ApiError.unauthorized('Your password was changed. Please sign in again.');
  }

  req.user = user;
  next();
});

/** Restricts a route to the listed roles. Use after `authenticate`. */
export function authorize(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (!roles.includes(req.user.role)) return next(ApiError.forbidden());
    next();
  };
}
