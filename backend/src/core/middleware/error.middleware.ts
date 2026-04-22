import { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors/app.errors.js';
import { db } from '../../config/database.js';

export const errorHandler = async (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  // Log error
  console.error(`[ERROR] ${err.message}`, {
    path: req.path,
    method: req.method,
    stack: process.env.APP_ENV === 'development' ? err.stack : undefined,
  });

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
    });
    return;
  }

  // Prisma errors
  if (err.name === 'PrismaClientKnownRequestError') {
    const prismaErr = err as any;
    
    if (prismaErr.code === 'P2002') {
      res.status(409).json({
        error: { code: 'CONFLICT', message: 'A record with this value already exists' },
      });
      return;
    }
    
    if (prismaErr.code === 'P2025') {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Record not found' },
      });
      return;
    }
  }

  // Default error
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: process.env.APP_ENV === 'development' ? err.message : 'Internal server error',
    },
  });
};

export const notFoundHandler = (req: Request, res: Response): void => {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`,
    },
  });
};

export const auditLogger = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  if (req.user && shouldAudit(req.method, req.path)) {
    const [resourceType, resourceId] = parseResource(req.path);
    
    await db.auditLog.create({
      data: {
        userId: req.user.id,
        action: `${req.method}_${resourceType}`.toUpperCase(),
        resourceType,
        resourceId,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      },
    });
  }
  
  next();
};

function shouldAudit(method: string, path: string): boolean {
  const auditableMethods = ['POST', 'PUT', 'DELETE', 'PATCH'];
  const auditablePaths = ['/auth/login', '/auth/register', '/users', '/spaces', '/pages', '/admin'];
  
  return auditableMethods.includes(method) && auditablePaths.some(p => path.startsWith(p));
}

function parseResource(path: string): [string, string | null] {
  const parts = path.split('/').filter(Boolean);
  
  if (parts.length >= 2) {
    return [parts[1], parts[2] || null];
  }
  
  return ['unknown', null];
}
