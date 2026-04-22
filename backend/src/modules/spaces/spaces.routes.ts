import { Router } from 'express';
import { spacesApi } from './spaces.service.js';
import { authenticate } from '../../core/middleware/auth.middleware.js';
import { requirePermission } from '../../core/middleware/rbac.middleware.js';
import { validate } from '../../core/middleware/validation.middleware.js';
import { z } from 'zod';

const router = Router();

const createSpaceSchema = z.object({
  body: z.object({
    name: z.string().min(2).max(255),
    key: z.string().min(2).max(100).regex(/^[a-z][a-z0-9-]*$/),
    description: z.string().optional(),
    visibility: z.enum(['PUBLIC', 'PRIVATE', 'RESTRICTED']).default('PRIVATE'),
  }),
});

router.get('/', authenticate, async (req, res, next) => {
  try {
    const spaces = await spacesApi.list(req.user!.id);
    res.json(spaces);
  } catch (error) {
    next(error);
  }
});

router.post('/', authenticate, validate(createSpaceSchema), async (req, res, next) => {
  try {
    const space = await spacesApi.create(req.user!.id, req.body);
    res.status(201).json(space);
  } catch (error) {
    next(error);
  }
});

router.get('/:key', authenticate, async (req, res, next) => {
  try {
    const space = await spacesApi.getByKey(req.params.key);
    res.json(space);
  } catch (error) {
    next(error);
  }
});

router.put('/:key', authenticate, requirePermission('space.manage'), async (req, res, next) => {
  try {
    const space = await spacesApi.update(req.params.key, req.body);
    res.json(space);
  } catch (error) {
    next(error);
  }
});

router.delete('/:key', authenticate, requirePermission('space.manage'), async (req, res, next) => {
  try {
    await spacesApi.delete(req.params.key);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

router.get('/:key/members', authenticate, async (req, res, next) => {
  try {
    const members = await spacesApi.listMembers(req.params.key);
    res.json(members);
  } catch (error) {
    next(error);
  }
});

router.post('/:key/members', authenticate, requirePermission('space.member.manage'), async (req, res, next) => {
  try {
    const member = await spacesApi.addMember(req.params.key, req.body.userId, req.body.role);
    res.status(201).json(member);
  } catch (error) {
    next(error);
  }
});

router.put('/:key/members/:userId', authenticate, requirePermission('space.member.manage'), async (req, res, next) => {
  try {
    const member = await spacesApi.updateMember(req.params.key, req.params.userId, req.body.role);
    res.json(member);
  } catch (error) {
    next(error);
  }
});

router.delete('/:key/members/:userId', authenticate, requirePermission('space.member.manage'), async (req, res, next) => {
  try {
    await spacesApi.removeMember(req.params.key, req.params.userId);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

export default router;
