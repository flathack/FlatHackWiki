import { Router } from 'express';
import { searchApi } from './search.service.js';
import { authenticate } from '../../core/middleware/auth.middleware.js';

const router = Router();

router.get('/', authenticate, async (req, res, next) => {
  try {
    const results = await searchApi.search(
      req.query.q as string,
      req.query.space as string,
      req.user!.id
    );
    res.json(results);
  } catch (error) {
    next(error);
  }
});

export default router;
