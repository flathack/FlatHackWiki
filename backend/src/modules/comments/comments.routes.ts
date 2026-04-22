import { Router } from 'express';
import { commentsApi } from './comments.service.js';
import { authenticate } from '../../core/middleware/auth.middleware.js';

const router = Router({ mergeParams: true });

router.get('/', authenticate, async (req, res, next) => {
  try {
    const comments = await commentsApi.listByPage(req.params.pageId);
    res.json(comments);
  } catch (error) {
    next(error);
  }
});

router.post('/', authenticate, async (req, res, next) => {
  try {
    const comment = await commentsApi.create(req.params.pageId, req.user!.id, req.body.content);
    res.status(201).json(comment);
  } catch (error) {
    next(error);
  }
});

router.put('/:id', authenticate, async (req, res, next) => {
  try {
    const comment = await commentsApi.update(req.params.id, req.user!.id, req.body.content);
    res.json(comment);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', authenticate, async (req, res, next) => {
  try {
    await commentsApi.delete(req.params.id, req.user!.id);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

export default router;
