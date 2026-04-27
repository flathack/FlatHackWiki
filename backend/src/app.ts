import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import { config } from './config/index.js';
import { helmetMiddleware, corsMiddleware, rateLimiter } from './config/security.js';
import { errorHandler, notFoundHandler, auditLogger } from './core/middleware/error.middleware.js';
import authRoutes from './modules/auth/auth.routes.js';
import spacesRoutes from './modules/spaces/spaces.routes.js';
import pagesRoutes from './modules/pages/pages.routes.js';
import commentsRoutes from './modules/comments/comments.routes.js';
import attachmentsRoutes from './modules/attachments/attachments.routes.js';
import searchRoutes from './modules/search/search.routes.js';
import adminRoutes from './modules/admin/admin.routes.js';
import dashboardRoutes from './modules/dashboard/dashboard.routes.js';
import amazonExpensesRoutes from './modules/amazon-expenses/amazon-expenses.routes.js';

const app = express();

app.set('trust proxy', 1);

app.use(helmetMiddleware);
app.use(corsMiddleware);
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(rateLimiter);

// Serve uploaded files
app.use('/uploads', express.static('uploads'));

app.use(auditLogger);

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
  });
});

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/spaces', spacesRoutes);
app.use('/api/v1/spaces/:key/pages', pagesRoutes);
app.use('/api/v1/pages/:pageId/comments', commentsRoutes);
app.use('/api/v1/pages/:pageId/attachments', attachmentsRoutes);
app.use('/api/v1/search', searchRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);
app.use('/api/v1/amazon-expenses', amazonExpensesRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
