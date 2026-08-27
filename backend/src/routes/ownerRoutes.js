import { Router } from 'express';
import * as owner from '../controllers/ownerController.js';
import { authenticate, authorize, ROLES } from '../middleware/auth.js';
import { rules, validate } from '../validators/index.js';

const router = Router();

router.use(authenticate, authorize(ROLES.OWNER));

router.get(
  '/dashboard',
  [...rules.pagination(), rules.optionalIdQuery('storeId')],
  validate,
  owner.dashboard,
);

export default router;
