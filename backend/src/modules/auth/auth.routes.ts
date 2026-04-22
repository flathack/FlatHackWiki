import { Router } from 'express';
import { authController } from './auth.controller;
import { validate } from '../../core/middleware/validation.middleware;
import { authenticate } from '../../core/middleware/auth.middleware;
import { authRateLimiter } from '../../config/security;
import {
  registerSchema,
  loginSchema,
  refreshSchema,
  passwordResetSchema,
} from './dto/auth.dto;

const router = Router();

router.post('/register', authRateLimiter, validate(registerSchema), authController.register);
router.post('/login', authRateLimiter, validate(loginSchema), authController.login);
router.post('/logout', authController.logout);
router.post('/refresh', validate(refreshSchema), authController.refresh);
router.post('/password-reset', authRateLimiter, validate(passwordResetSchema), authController.requestPasswordReset);

router.get('/me', authenticate, authController.me);

export default router;
