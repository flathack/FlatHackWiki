import { Router } from 'express';
import { authController } from './auth.controller.js';
import { validate } from '../../core/middleware/validation.middleware.js';
import { authenticate } from '../../core/middleware/auth.middleware.js';
import { authRateLimiter } from '../../config/security.js';
import {
  registerSchema,
  loginSchema,
  refreshSchema,
  passwordResetSchema,
} from './dto/auth.dto.js';

const router = Router();

router.post('/register', authRateLimiter, validate(registerSchema), authController.register);
router.post('/login', authRateLimiter, validate(loginSchema), authController.login);
router.post('/logout', authController.logout);
router.post('/refresh', validate(refreshSchema), authController.refresh);
router.post('/password-reset', authRateLimiter, validate(passwordResetSchema), authController.requestPasswordReset);

router.get('/me', authenticate, authController.me);

export default router;
