import { Router } from 'express';
import { authenticate } from '../../core/middleware/auth.middleware.js';
import { validate } from '../../core/middleware/validation.middleware.js';
import { mailController } from './mail.controller.js';
import {
  listMailQuerySchema,
  mailAccountIdParamsSchema,
  mailMessageIdParamsSchema,
  setupMailAccountSchema,
  testMailAccountSchema,
  updateMailAccountSchema,
  updateMailMessageSchema,
} from './dto/mail.dto.js';

const router = Router();

router.use(authenticate);

router.get('/', validate(listMailQuerySchema), mailController.list);
router.get('/widget', mailController.widget);
router.post('/sync', mailController.syncAll);
router.get('/accounts', mailController.accounts);
router.post('/accounts/test', validate(testMailAccountSchema), mailController.testAccount);
router.post('/accounts', validate(setupMailAccountSchema), mailController.createAccount);
router.patch('/accounts/:accountId', validate(updateMailAccountSchema), mailController.updateAccount);
router.delete('/accounts/:accountId', validate(mailAccountIdParamsSchema), mailController.deleteAccount);
router.post('/accounts/:accountId/sync', validate(mailAccountIdParamsSchema), mailController.syncAccount);
router.get('/messages/:messageId', validate(mailMessageIdParamsSchema), mailController.getMessage);
router.patch('/messages/:messageId', validate(updateMailMessageSchema), mailController.updateMessage);

export default router;
