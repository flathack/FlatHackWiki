import { Role, UserStatus } from '@prisma/client';
import { z } from 'zod';

const passwordSchema = z.string().min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number');

export const createUserSchema = z.object({
  body: z.object({
    username: z.string().trim().min(1).max(255),
    email: z.string().trim().email('Invalid email address'),
    firstName: z.string().trim().min(1).max(255),
    lastName: z.string().trim().min(1).max(255),
    password: passwordSchema,
    globalRole: z.nativeEnum(Role).optional(),
  }),
});

export const updateUserSchema = z.object({
  params: z.object({
    userId: z.string().uuid(),
  }),
  body: z.object({
    name: z.string().trim().min(1).max(255).optional(),
    status: z.nativeEnum(UserStatus).optional(),
    globalRole: z.nativeEnum(Role).nullable().optional(),
  }),
});

export const userIdParamsSchema = z.object({
  params: z.object({
    userId: z.string().uuid(),
  }),
});

export type CreateUserInput = z.infer<typeof createUserSchema>['body'];
export type UpdateUserInput = z.infer<typeof updateUserSchema>['body'];
