import { Router } from 'express';
import * as stores from '../controllers/storeController.js';
import * as ratings from '../controllers/ratingController.js';
import { authenticate, authorize, ROLES } from '../middleware/auth.js';
import { writeLimiter } from '../middleware/rateLimit.js';
import { rules, validate } from '../validators/index.js';

const router = Router();

router.use(authenticate);

// Any signed-in account can browse the catalogue...
router.get(
  '/',
  [...rules.pagination(), rules.filterTerm('name'), rules.filterTerm('address')],
  validate,
  stores.listStores,
);
router.get('/:id', rules.idParam(), validate, stores.getStore);

// ...but only Normal Users submit ratings.
router.put(
  '/:id/rating',
  authorize(ROLES.USER),
  writeLimiter,
  [rules.idParam(), rules.ratingValue()],
  validate,
  ratings.submitRating,
);

router.delete(
  '/:id/rating',
  authorize(ROLES.USER),
  writeLimiter,
  rules.idParam(),
  validate,
  ratings.deleteRating,
);

export default router;
