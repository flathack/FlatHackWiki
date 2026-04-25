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
  updateMeSchema,
} from './dto/auth.dto.js';

const router = Router();

router.post('/register', authRateLimiter, validate(registerSchema), authController.register);
router.post('/login', authRateLimiter, validate(loginSchema), authController.login);
router.post('/logout', authController.logout);
router.post('/refresh', validate(refreshSchema), authController.refresh);
router.post('/password-reset', authRateLimiter, validate(passwordResetSchema), authController.requestPasswordReset);
router.get('/oidc/config', authController.oidcConfig);
router.get('/oidc/login', authRateLimiter, authController.oidcLogin);
router.get('/oidc/callback', authRateLimiter, authController.oidcCallback);
router.get('/oidc/logout', authController.oidcLogout);

router.get('/me', authenticate, authController.me);
router.patch('/me', authenticate, validate(updateMeSchema), authController.updateMe);

export default router;
