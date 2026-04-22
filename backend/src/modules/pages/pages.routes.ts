import { Router } from 'express';
import { pagesApi } from './pages.service.js';
import { authenticate } from '../../core/middleware/auth.middleware.js';
import { requirePermission } from '../../core/middleware/rbac.middleware.js';

const router = Router({ mergeParams: true });

router.get('/', authenticate, async (req, res, next) => {
  try {
    const pages = await pagesApi.list(req.params.key);
    res.json(pages);
  } catch (error) {
    next(error);
  }
});

router.post('/', authenticate, requirePermission('page.create'), async (req, res, next) => {
  try {
    const page = await pagesApi.create(req.params.key, req.user!.id, req.body);
    res.status(201).json(page);
  } catch (error) {
    next(error);
  }
});

router.get('/:slug', authenticate, async (req, res, next) => {
  try {
    const page = await pagesApi.getBySlug(req.params.key, req.params.slug);
    res.json(page);
  } catch (error) {
    next(error);
  }
});

router.put('/:slug', authenticate, requirePermission('page.update'), async (req, res, next) => {
  try {
    const page = await pagesApi.update(req.params.key, req.params.slug, req.user!.id, req.body);
    res.json(page);
  } catch (error) {
    next(error);
  }
});

router.delete('/:slug', authenticate, requirePermission('page.delete'), async (req, res, next) => {
  try {
    await pagesApi.delete(req.params.key, req.params.slug);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

router.get('/:slug/versions', authenticate, async (req, res, next) => {
  try {
    const versions = await pagesApi.getVersions(req.params.key, req.params.slug);
    res.json(versions);
  } catch (error) {
    next(error);
  }
});

export default router;
