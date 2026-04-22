import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/index;
import { db } from '../config/database;
import { UnauthorizedError } from '../errors/app.errors;

export interface JWTPayload {
  sub: string;
  email: string;
  type: 'access' | 'refresh';
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  globalRole: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('No token provided');
    }
    
    const token = authHeader.substring(7);
    
    try {
      const payload = jwt.verify(token, config.JWT_SECRET) as JWTPayload;
      
      if (payload.type !== 'access') {
        throw new UnauthorizedError('Invalid token type');
      }
      
      const user = await db.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, email: true, status: true },
      });
      
      if (!user || user.status === 'DELETED') {
        throw new UnauthorizedError('User not found');
      }
      
      req.user = {
        id: user.id,
        email: user.email,
        globalRole: await getGlobalRole(user.id),
      };
      
      next();
    } catch (err) {
      if (err instanceof jwt.JsonWebTokenError) {
        throw new UnauthorizedError('Invalid token');
      }
      if (err instanceof jwt.TokenExpiredError) {
        throw new UnauthorizedError('Token expired');
      }
      throw err;
    }
  } catch (error) {
    next(error);
  }
};

async function getGlobalRole(userId: string): Promise<string> {
  const assignment = await db.roleAssignment.findFirst({
    where: {
      principalType: 'user',
      principalId: userId,
      scopeType: 'GLOBAL',
    },
    orderBy: {
      roleName: 'asc',
    },
  });
  
  if (!assignment) return 'USER';
  
  return assignment.roleName;
}

export const optionalAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return next();
    }
    
    return authenticate(req, res, next);
  } catch {
    next();
  }
};
