import { Router } from 'express';
import { pool } from '../config/db.js';
import authRoutes from './authRoutes.js';
import adminRoutes from './adminRoutes.js';
import storeRoutes from './storeRoutes.js';
import ownerRoutes from './ownerRoutes.js';

const router = Router();

/**
 * Liveness: is the process up and answering? Deliberately touches nothing else,
 * so a restart loop is never triggered by a dependency being briefly slow.
 */
router.get('/health', (_req, res) => res.json({ status: 'ok', uptimeSeconds: Math.round(process.uptime()) }));

/**
 * Readiness: should this instance be sent traffic? Answers only while the
 * database is actually reachable, so an instance that cannot serve a request is
 * taken out of rotation rather than handed requests it can only fail.
 */
router.get('/ready', async (_req, res) => {
  const started = process.hrtime.bigint();
  try {
    await pool.query('SELECT 1');
    res.json({
      status: 'ok',
      databaseLatencyMs: Math.round(Number(process.hrtime.bigint() - started) / 1e5) / 10,
      pool: { total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount },
    });
  } catch (err) {
    res.status(503).json({ status: 'unavailable', reason: 'database unreachable', code: err.code });
  }
});

router.use('/auth', authRoutes);
router.use('/admin', adminRoutes);
router.use('/stores', storeRoutes);
router.use('/owner', ownerRoutes);

export default router;
