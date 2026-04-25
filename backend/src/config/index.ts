import { z } from 'zod';

const envBoolean = z.preprocess((value) => value === true || value === 'true' || value === '1', z.boolean());

const envSchema = z.object({
  APP_ENV: z.enum(['development', 'production', 'test']).default('development'),
  APP_PORT: z.coerce.number().default(3001),
  APP_URL: z.string().default('http://localhost:3001'),
  FRONTEND_URL: z.string().default('http://localhost'),
  
  DATABASE_URL: z.string(),
  
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  
  STORAGE_TYPE: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_PATH: z.string().default('./uploads'),
  
  CORS_ORIGIN: z.string().default('http://localhost:5173'),

  OIDC_ENABLED: envBoolean.default(false),
  OIDC_PROVIDER_NAME: z.string().default('Zentrales Konto'),
  OIDC_ISSUER: z.string().optional(),
  OIDC_PUBLIC_ISSUER: z.string().optional(),
  OIDC_CLIENT_ID: z.string().optional(),
  OIDC_CLIENT_SECRET: z.string().optional(),
  OIDC_REDIRECT_URI: z.string().optional(),
  OIDC_SCOPES: z.string().default('openid email profile'),
  OIDC_TOKEN_AUTH_METHOD: z.enum(['client_secret_post', 'client_secret_basic']).default('client_secret_post'),
  OIDC_DEFAULT_ROLE: z
    .enum(['SUPER_ADMIN', 'SYSTEM_ADMIN', 'SPACE_ADMIN', 'EDITOR', 'AUTHOR', 'COMMENTER', 'VIEWER', 'GUEST'])
    .default('VIEWER'),
  OIDC_SUPER_ADMIN_EMAILS: z.string().default(''),
});

export const config = envSchema.parse(process.env);

export type Config = typeof config;
