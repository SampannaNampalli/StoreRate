import { Router } from 'express';
import * as admin from '../controllers/adminController.js';
import { authenticate, authorize, ROLES } from '../middleware/auth.js';
import { writeLimiter } from '../middleware/rateLimit.js';
import { rules, validate } from '../validators/index.js';

const router = Router();

/** Filter terms accepted by the two listing endpoints. */
const LIST_FILTERS = [rules.filterTerm('name'), rules.filterTerm('email'), rules.filterTerm('address')];

// Everything below is System Administrator only.
router.use(authenticate, authorize(ROLES.ADMIN));

router.get('/dashboard', admin.dashboard);

router.get('/users', [...rules.pagination(), ...LIST_FILTERS], validate, admin.listUsers);
router.post(
  '/users',
  writeLimiter,
  [rules.name(), rules.email(), rules.address(), rules.password(), rules.role()],
  validate,
  admin.createUser,
);
router.get('/users/:id', rules.idParam(), validate, admin.getUser);

router.get('/stores', [...rules.pagination(), ...LIST_FILTERS], validate, admin.listStores);
router.post(
  '/stores',
  writeLimiter,
  [rules.name(), rules.email(), rules.address(), rules.optionalIdBody('ownerId')],
  validate,
  admin.createStore,
);

router.get(
  '/owners',
  [...rules.pagination(), rules.filterTerm('name'), rules.filterTerm('email')],
  validate,
  admin.listOwners,
);

export default router;
