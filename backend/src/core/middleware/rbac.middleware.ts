import { Request, Response, NextFunction } from 'express';
import { db } from '../config/database;
import { Role, ScopeType } from '@prisma/client';
import { ForbiddenError, UnauthorizedError } from '../errors/app.errors;

type Permission = | '*';
  | 'space.view' | 'space.manage' | 'space.member.manage' | 'space.export'
  | 'page.read' | 'page.create' | 'page.update' | 'page.delete' | 'page.move' | 'page.export' | 'page.restrict'
  | 'attachment.upload' | 'attachment.delete' | 'attachment.view'
  | 'comment.create' | 'comment.moderate' | 'comment.delete'
  | 'audit.view';

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  SUPER_ADMIN: ['*'], // All permissions
  SYSTEM_ADMIN: [
    'space.view', 'space.manage', 'space.member.manage', 'space.export',
    'page.read', 'page.create', 'page.update', 'page.delete', 'page.move', 'page.export', 'page.restrict',
    'attachment.upload', 'attachment.delete', 'attachment.view',
    'comment.create', 'comment.moderate', 'comment.delete',
    'audit.view',
  ],
  SPACE_ADMIN: [
    'space.view', 'space.manage', 'space.member.manage',
    'page.read', 'page.create', 'page.update', 'page.delete', 'page.move', 'page.export', 'page.restrict',
    'attachment.upload', 'attachment.delete', 'attachment.view',
    'comment.create', 'comment.moderate',
    'audit.view',
  ],
  EDITOR: [
    'space.view',
    'page.read', 'page.create', 'page.update', 'page.move',
    'attachment.upload', 'attachment.view',
    'comment.create',
  ],
  AUTHOR: [
    'space.view',
    'page.read', 'page.create',
    'attachment.upload', 'attachment.view',
    'comment.create',
  ],
  COMMENTER: [
    'space.view',
    'page.read',
    'comment.create',
  ],
  VIEWER: [
    'space.view',
    'page.read',
  ],
  GUEST: [
    'space.view',
    'page.read',
  ],
};

export const requirePermission = (permission: Permission) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new UnauthorizedError();
      }

      const hasPermission = await checkPermission(req.user.id, req.user.globalRole, permission, req.params);
      
      if (!hasPermission) {
        throw new ForbiddenError(`Missing required permission: ${permission}`);
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

async function checkPermission(
  userId: string,
  globalRole: string,
  permission: Permission,
  params: Record<string, string>
): Promise<boolean> {
  // SUPER_ADMIN has all permissions
  if (globalRole === 'SUPER_ADMIN') {
    return true;
  }

  // Get user's role for this space if applicable
  const spaceKey = params.key || params.spaceKey;
  
  if (spaceKey) {
    const space = await db.space.findUnique({
      where: { key: spaceKey },
      select: { id: true, ownerId: true },
    });

    if (!space) return false;

    // Owner has all permissions
    if (space.ownerId === userId) {
      return true;
    }

    // Check space-specific role
    const memberShip = await db.spaceMember.findUnique({
      where: {
        spaceId_userId: { spaceId: space.id, userId },
      },
    });

    if (memberShip) {
      const rolePermissions = ROLE_PERMISSIONS[memberShip.role];
      return rolePermissions.includes('*') || rolePermissions.includes(permission);
    }
  }

  // Check global role
  if (globalRole !== 'USER') {
    const rolePermissions = ROLE_PERMISSIONS[globalRole as Role];
    return rolePermissions.includes('*') || rolePermissions.includes(permission);
  }

  return false;
}

export const requireSpaceRole = (...roles: Role[]) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new UnauthorizedError();
      }

      const spaceKey = req.params.key || req.params.spaceKey;
      
      if (!spaceKey) {
        throw new ForbiddenError('Space context required');
      }

      const space = await db.space.findUnique({
        where: { key: spaceKey },
        select: { id: true, ownerId: true },
      });

      if (!space) {
        throw new ForbiddenError('Space not found');
      }

      if (space.ownerId === req.user.id) {
        return next();
      }

      const membership = await db.spaceMember.findUnique({
        where: {
          spaceId_userId: { spaceId: space.id, userId: req.user.id },
        },
      });

      if (!membership || !roles.includes(membership.role)) {
        throw new ForbiddenError(`Required role: ${roles.join(' or ')}`);
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};
