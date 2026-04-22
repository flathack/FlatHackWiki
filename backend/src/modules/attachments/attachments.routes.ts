import { Router } from 'express';
import { attachmentsApi } from './attachments.service.js';
import { authenticate } from '../../core/middleware/auth.middleware.js';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const router = Router({ mergeParams: true });

const storage = multer.diskStorage({
  destination: './uploads',
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    cb(null, allowed.includes(file.mimetype));
  },
});

router.get('/', authenticate, async (req, res, next) => {
  try {
    const attachments = await attachmentsApi.listByPage(req.params.pageId);
    res.json(attachments);
  } catch (error) {
    next(error);
  }
});

router.post('/', authenticate, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) throw new Error('No file uploaded');
    const attachment = await attachmentsApi.upload(
      req.params.pageId,
      req.user!.id,
      req.file.originalname,
      req.file.mimetype,
      req.file.size,
      req.file.path
    );
    res.status(201).json(attachment);
  } catch (error) {
    next(error);
  }
});

router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const attachment = await attachmentsApi.getById(req.params.id);
    res.json(attachment);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', authenticate, async (req, res, next) => {
  try {
    await attachmentsApi.delete(req.params.id, req.user!.id);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

export default router;
