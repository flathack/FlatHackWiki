import { Router } from 'express';
import { adminApi } from './admin.service.js';
import { authenticate } from '../../core/middleware/auth.middleware.js';
import { requirePermission } from '../../core/middleware/rbac.middleware.js';

const router = Router();

router.use(authenticate);

router.get('/users', requirePermission('audit.view'), async (req, res, next) => {
  try {
    const users = await adminApi.listUsers();
    res.json(users);
  } catch (error) {
    next(error);
  }
});

router.get('/audit-log', requirePermission('audit.view'), async (req, res, next) => {
  try {
    const logs = await adminApi.getAuditLogs(
      req.query.limit ? parseInt(req.query.limit as string) : 100,
      req.query.offset ? parseInt(req.query.offset as string) : 0
    );
    res.json(logs);
  } catch (error) {
    next(error);
  }
});

router.get('/stats', requirePermission('audit.view'), async (req, res, next) => {
  try {
    const stats = await adminApi.getStats();
    res.json(stats);
  } catch (error) {
    next(error);
  }
});

export default router;
