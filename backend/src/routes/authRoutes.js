import { Router } from 'express';
import { body } from 'express-validator';
import * as auth from '../controllers/authController.js';
import { authenticate } from '../middleware/auth.js';
import { accountLimiter, loginLimiter, registerLimiter, writeLimiter } from '../middleware/rateLimit.js';
import { rules, validate } from '../validators/index.js';

const router = Router();

router.post(
  '/register',
  registerLimiter,
  [rules.name(), rules.email(), rules.address(), rules.password()],
  validate,
  auth.register,
);

// Two limiters: one per source address, one per account. The first throttles a
// single machine working through a password list; the second catches the same
// guessing spread across many addresses, which the per-IP counter cannot see.
router.post(
  '/login',
  loginLimiter,
  accountLimiter,
  [rules.email(), body('password').isString().withMessage('Password is required').bail().notEmpty()],
  validate,
  auth.login,
);

router.get('/me', authenticate, auth.me);

router.put(
  '/password',
  authenticate,
  writeLimiter,
  [
    body('currentPassword').isString().withMessage('Current password is required').bail().notEmpty(),
    rules.password('newPassword'),
  ],
  validate,
  auth.updatePassword,
);

export default router;
