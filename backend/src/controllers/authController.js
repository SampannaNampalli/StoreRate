import { query } from '../config/db.js';
import { ROLES, signToken, toIssuedAt } from '../middleware/auth.js';
import { ApiError, asyncHandler } from '../utils/ApiError.js';
import { hashPassword, needsRehash, verifyAgainstDummy, verifyPassword } from '../utils/password.js';
import { logger } from '../utils/logger.js';

function publicUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    address: row.address,
    role: row.role,
  };
}

/** POST /api/auth/register - public signup, always creates a Normal User. */
export const register = asyncHandler(async (req, res) => {
  const { name, email, address = '', password } = req.body;

  const existing = await query('SELECT 1 FROM users WHERE LOWER(email) = LOWER($1)', [email]);
  if (existing.rowCount > 0) {
    throw ApiError.conflict('An account with this email already exists');
  }

  const { rows } = await query(
    `INSERT INTO users (name, email, password_hash, address, role)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, name, email, address, role, password_changed_at`,
    [name, email, await hashPassword(password), address, ROLES.USER],
  );

  const user = rows[0];
  res.status(201).json({
    token: signToken(user, { issuedAt: toIssuedAt(user.password_changed_at) }),
    user: publicUser(user),
  });
});

/** POST /api/auth/login - single login for all three roles. */
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const { rows } = await query(
    'SELECT id, name, email, address, role, password_hash FROM users WHERE LOWER(email) = LOWER($1)',
    [email],
  );

  const user = rows[0];

  // Hash a throwaway value when no account matched, so the response takes the
  // same time either way. Returning early instead answered an unregistered
  // address in single-digit milliseconds against ~130 ms for a registered one -
  // a gap that enumerates accounts no matter how carefully the error message
  // below avoids saying which half failed.
  const passwordMatches = user
    ? await verifyPassword(password, user.password_hash)
    : await verifyAgainstDummy(password);

  if (!passwordMatches) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  // A correct password is the only moment the plaintext is available, so it is
  // also the only chance to move an account off a legacy hash. Best-effort: a
  // failure here is an upgrade that did not happen, not a failed sign-in.
  if (needsRehash(user.password_hash)) {
    try {
      await query('UPDATE users SET password_hash = $1 WHERE id = $2', [
        await hashPassword(password),
        user.id,
      ]);
    } catch (err) {
      logger.error('password_rehash_failed', { userId: user.id }, err);
    }
  }

  res.json({ token: signToken(user), user: publicUser(user) });
});

/** GET /api/auth/me - current session, used by the SPA on reload. */
export const me = asyncHandler((req, res) => {
  res.json({ user: publicUser(req.user) });
});

/** PUT /api/auth/password - available to every logged-in role. */
export const updatePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
  if (!(await verifyPassword(currentPassword, rows[0].password_hash))) {
    throw ApiError.badRequest('Current password is incorrect', [
      { field: 'currentPassword', message: 'Current password is incorrect' },
    ]);
  }

  if (currentPassword === newPassword) {
    throw ApiError.badRequest('New password must differ from the current password', [
      { field: 'newPassword', message: 'New password must differ from the current password' },
    ]);
  }

  // Stamping `password_changed_at` is what makes this a revocation: every token
  // issued before this instant stops being accepted, so a password changed
  // because it may have leaked actually ends the sessions opened with it.
  const updated = await query(
    `UPDATE users SET password_hash = $1, password_changed_at = NOW()
     WHERE id = $2
     RETURNING password_changed_at`,
    [await hashPassword(newPassword), req.user.id],
  );

  // Including the caller's own session, so hand back a replacement rather than
  // signing out the person who made the change.
  res.json({
    message: 'Password updated successfully',
    token: signToken(req.user, { issuedAt: toIssuedAt(updated.rows[0].password_changed_at) }),
  });
});
