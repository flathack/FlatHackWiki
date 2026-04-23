import { z } from 'zod';
import { UserStatus } from '@prisma/client';

export const registerSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
      .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
      .regex(/[0-9]/, 'Password must contain at least one number'),
    name: z.string().min(2, 'Name must be at least 2 characters').max(255),
  }),
});

export const loginSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(1, 'Password is required'),
  }),
});

export const passwordResetSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
  }),
});

export const passwordSetSchema = z.object({
  body: z.object({
    token: z.string().min(1, 'Token is required'),
    password: z.string().min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
      .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
      .regex(/[0-9]/, 'Password must contain at least one number'),
  }),
});

export const refreshSchema = z.object({
  body: z.object({
    refreshToken: z.string().min(1, 'Refresh token is required'),
  }),
});

export const updateMeSchema = z.object({
  body: z.object({
    displayName: z.string().trim().min(1, 'Display name is required').max(255).optional(),
    dashboardSubtitle: z.string().trim().max(500).nullable().optional(),
    showDashboardSubtitle: z.boolean().optional(),
    uiRadius: z.number().int().min(8).max(40).optional(),
  }),
});

export type RegisterInput = z.infer<typeof registerSchema>['body'];
export type LoginInput = z.infer<typeof loginSchema>['body'];
export type PasswordResetInput = z.infer<typeof passwordResetSchema>['body'];
export type PasswordSetInput = z.infer<typeof passwordSetSchema>['body'];
export type RefreshInput = z.infer<typeof refreshSchema>['body'];
export type UpdateMeInput = z.infer<typeof updateMeSchema>['body'];
