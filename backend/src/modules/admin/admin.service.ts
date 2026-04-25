import { db } from '../../config/database.js';
import { ForbiddenError, NotFoundError } from '../../core/errors/app.errors.js';
import type { UpdateUserInput } from './dto/admin.dto.js';

class AdminService {
  async listUsers() {
    const users = await db.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        profile: { select: { displayName: true, avatarUrl: true } },
        roleAssignments: {
          where: { scopeType: 'GLOBAL', principalType: 'user' },
          select: { roleName: true },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return users.map((user) => ({
      ...user,
      globalRole: user.roleAssignments[0]?.roleName || 'USER',
      roleAssignments: undefined,
    }));
  }

  async getAuditLogs(limit = 100, offset = 0) {
    return db.auditLog.findMany({
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });
  }

  async getStats() {
    const [userCount, activeUserCount, inactiveUserCount, spaceCount, pageCount, commentCount, auditLogCount, sessionCount] = await Promise.all([
      db.user.count(),
      db.user.count({ where: { status: 'ACTIVE' } }),
      db.user.count({ where: { status: 'INACTIVE' } }),
      db.space.count(),
      db.page.count({ where: { deletedAt: null } }),
      db.comment.count({ where: { deletedAt: null } }),
      db.auditLog.count(),
      db.userSession.count(),
    ]);
    return { userCount, activeUserCount, inactiveUserCount, spaceCount, pageCount, commentCount, auditLogCount, sessionCount };
  }

  async updateUser(actorUserId: string, userId: string, input: UpdateUserInput) {
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError('User', userId);

    const currentRole = await this.getGlobalRole(userId);
    const nextRole = input.globalRole === undefined ? currentRole : input.globalRole;
    if (actorUserId === userId && currentRole === 'SUPER_ADMIN' && nextRole !== 'SUPER_ADMIN') {
      throw new ForbiddenError('Du kannst dir die SUPER_ADMIN-Rolle nicht selbst entziehen.');
    }
    if (actorUserId === userId && input.status && input.status !== 'ACTIVE') {
      throw new ForbiddenError('Du kannst deinen eigenen Account nicht deaktivieren.');
    }

    await db.$transaction(async (tx) => {
      if (input.name || input.status) {
        await tx.user.update({
          where: { id: userId },
          data: {
            ...(input.name ? { name: input.name } : {}),
            ...(input.status ? { status: input.status } : {}),
            ...(input.name
              ? {
                  profile: {
                    upsert: {
                      create: { displayName: input.name },
                      update: { displayName: input.name },
                    },
                  },
                }
              : {}),
          },
        });
      }

      if (input.globalRole !== undefined) {
        await tx.roleAssignment.deleteMany({
          where: { principalType: 'user', principalId: userId, scopeType: 'GLOBAL' },
        });

        if (input.globalRole) {
          await tx.roleAssignment.create({
            data: {
              principalType: 'user',
              principalId: userId,
              scopeType: 'GLOBAL',
              roleName: input.globalRole,
            },
          });
        }
      }
    });

    return this.getUser(userId);
  }

  async deleteUser(actorUserId: string, userId: string) {
    if (actorUserId === userId) {
      throw new ForbiddenError('Du kannst deinen eigenen Account nicht löschen.');
    }

    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError('User', userId);

    await db.user.update({ where: { id: userId }, data: { status: 'DELETED' } });
    await db.userSession.deleteMany({ where: { userId } });
    return { message: 'User marked as deleted' };
  }

  async revokeSessions(userId: string) {
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError('User', userId);
    const result = await db.userSession.deleteMany({ where: { userId } });
    return { revoked: result.count };
  }

  private async getUser(userId: string) {
    const [user, globalRole] = await Promise.all([
      db.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          name: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          profile: { select: { displayName: true, avatarUrl: true } },
        },
      }),
      this.getGlobalRole(userId),
    ]);

    if (!user) throw new NotFoundError('User', userId);
    return { ...user, globalRole };
  }

  private async getGlobalRole(userId: string) {
    const assignment = await db.roleAssignment.findFirst({
      where: { principalType: 'user', principalId: userId, scopeType: 'GLOBAL' },
      select: { roleName: true },
    });
    return assignment?.roleName || 'USER';
  }
}

export const adminApi = new AdminService();
