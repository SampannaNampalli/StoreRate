import { body, param, query, validationResult } from 'express-validator';
import { ROLES } from '../middleware/auth.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * Rules from the assessment spec, kept in one place so the API and the UI
 * cannot drift apart (the React app mirrors these in src/utils/validation.js).
 *
 *   Name     20..60 characters
 *   Address  up to 400 characters
 *   Password 8..16 characters, >= 1 uppercase, >= 1 special character
 *   Email    standard email format
 */
export const PASSWORD_PATTERN = /^(?=.*[A-Z])(?=.*[!@#$%^&*(),.?":{}|<>_\-+=[\]\\/~`';])[\S]{8,16}$/;

/**
 * The largest value a PostgreSQL `integer` column holds. Ids are SERIAL, so
 * anything above this is not "a row that does not exist" - it makes the driver
 * raise a range error the API used to report as a 500. Rejecting it here keeps
 * an out-of-range id a plain 400.
 */
const MAX_INT4 = 2_147_483_647;

/**
 * JSON bodies can carry arrays and objects where a scalar is expected, and
 * express-validator's checks stringify before testing - so `{"rating": [5]}`
 * passed `isInt` and then reached PostgreSQL as a malformed literal. Requiring a
 * primitive first stops that at the edge.
 */
const isScalar = (value) => ['string', 'number', 'boolean'].includes(typeof value);

export const rules = {
  name: (field = 'name') =>
    body(field)
      .custom(isScalar)
      .withMessage('Name must be text')
      .bail()
      .trim()
      .isLength({ min: 20, max: 60 })
      .withMessage('Name must be between 20 and 60 characters'),

  email: (field = 'email') =>
    body(field)
      .custom(isScalar)
      .withMessage('Enter a valid email address')
      .bail()
      .trim()
      .isEmail()
      .withMessage('Enter a valid email address')
      .isLength({ max: 255 })
      .withMessage('Email must be at most 255 characters'),
  // Deliberately not normalised. `normalizeEmail` strips `+tag` subaddressing,
  // so alice+shopping@gmail.com silently became alice@gmail.com - rewriting an
  // address the user chose, and collapsing addresses that are not the same
  // account. Case-insensitivity is enforced by the `LOWER(email)` unique index
  // and the `LOWER(email) = LOWER($1)` lookups, which is where it belongs.

  address: (field = 'address') =>
    body(field)
      .optional({ nullable: true })
      .custom(isScalar)
      .withMessage('Address must be text')
      .bail()
      .trim()
      .isLength({ max: 400 })
      .withMessage('Address must be at most 400 characters'),

  password: (field = 'password') =>
    body(field)
      .isString()
      .withMessage('Password must be 8 to 16 characters')
      .bail()
      .isLength({ min: 8, max: 16 })
      .withMessage('Password must be 8 to 16 characters')
      .matches(PASSWORD_PATTERN)
      .withMessage('Password must include at least one uppercase letter and one special character'),

  role: (field = 'role') =>
    body(field)
      .optional()
      .isIn(Object.values(ROLES))
      .withMessage(`Role must be one of ${Object.values(ROLES).join(', ')}`),

  ratingValue: (field = 'rating') =>
    body(field)
      .custom(isScalar)
      .withMessage('Rating must be a whole number between 1 and 5')
      .bail()
      .isInt({ min: 1, max: 5 })
      .withMessage('Rating must be a whole number between 1 and 5')
      .toInt(),

  idParam: (field = 'id') =>
    param(field).isInt({ min: 1, max: MAX_INT4 }).withMessage('Invalid id').toInt(),

  optionalIdBody: (field) =>
    body(field)
      .optional({ nullable: true, checkFalsy: true })
      .custom(isScalar)
      .withMessage('Invalid id')
      .bail()
      .isInt({ min: 1, max: MAX_INT4 })
      .withMessage('Invalid id')
      .toInt(),

  optionalIdQuery: (field) =>
    query(field).optional({ nullable: true, checkFalsy: true }).isInt({ min: 1, max: MAX_INT4 }).toInt(),

  /** Free-text filter terms. Bounded so a filter cannot carry a megabyte of pattern. */
  filterTerm: (field) =>
    query(field).optional().isString().withMessage(`${field} filter must be text`).bail().trim().isLength({ max: 255 })
      .withMessage(`${field} filter must be at most 255 characters`),

  pagination: () => [
    query('page').optional().isInt({ min: 1, max: MAX_INT4 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('sortOrder').optional().isIn(['asc', 'desc', 'ASC', 'DESC']),
    query('sortBy').optional().isString().isLength({ max: 40 }),
  ],
};

/** Terminates the chain: turns collected validation errors into a 400 response. */
export function validate(req, _res, next) {
  const result = validationResult(req);
  if (result.isEmpty()) return next();

  const details = result.array().map((e) => ({ field: e.path, message: e.msg }));
  next(ApiError.badRequest('Validation failed', details));
}
