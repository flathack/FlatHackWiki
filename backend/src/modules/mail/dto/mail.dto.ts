import { z } from 'zod';

const mailSecurityModeSchema = z.enum(['SSL_TLS', 'STARTTLS', 'NONE']);

export const mailAccountIdParamsSchema = z.object({
  params: z.object({
    accountId: z.string().uuid(),
  }),
});

export const mailMessageIdParamsSchema = z.object({
  params: z.object({
    messageId: z.string().uuid(),
  }),
});

export const listMailQuerySchema = z.object({
  query: z.object({
    accountId: z.string().uuid().optional(),
    folder: z.string().trim().min(1).max(500).optional(),
    q: z.string().trim().max(200).optional(),
    filter: z.enum(['all', 'unread', 'flagged', 'attachments']).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    offset: z.coerce.number().int().min(0).max(10000).optional(),
  }),
});

export const setupMailAccountSchema = z.object({
  body: z.object({
    displayName: z.string().trim().min(1).max(255).optional(),
    email: z.string().trim().email().max(255),
    username: z.string().trim().min(1).max(255),
    password: z.string().min(1).max(2000),
    imapHost: z.string().trim().min(1).max(255),
    imapPort: z.coerce.number().int().min(1).max(65535),
    securityMode: mailSecurityModeSchema.default('SSL_TLS'),
    syncNow: z.boolean().optional(),
  }),
});

export const testMailAccountSchema = z.object({
  body: z.object({
    username: z.string().trim().min(1).max(255),
    password: z.string().min(1).max(2000),
    imapHost: z.string().trim().min(1).max(255),
    imapPort: z.coerce.number().int().min(1).max(65535),
    securityMode: mailSecurityModeSchema.default('SSL_TLS'),
  }),
});

export const updateMailAccountSchema = z.object({
  body: z.object({
    displayName: z.string().trim().min(1).max(255).optional(),
    email: z.string().trim().email().max(255).optional(),
    username: z.string().trim().min(1).max(255).optional(),
    password: z.string().min(1).max(2000).optional(),
    imapHost: z.string().trim().min(1).max(255).optional(),
    imapPort: z.coerce.number().int().min(1).max(65535).optional(),
    securityMode: mailSecurityModeSchema.optional(),
    status: z.enum(['ACTIVE', 'NEEDS_ATTENTION', 'DISABLED']).optional(),
  }),
  params: z.object({
    accountId: z.string().uuid(),
  }),
});

export const updateMailMessageSchema = z.object({
  body: z.object({
    isRead: z.boolean().optional(),
    isFlagged: z.boolean().optional(),
  }),
  params: z.object({
    messageId: z.string().uuid(),
  }),
});
