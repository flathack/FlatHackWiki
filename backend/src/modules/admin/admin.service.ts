import { db } from '../../config/database.js';

class AdminService {
  async listUsers() {
    return db.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        status: true,
        createdAt: true,
        profile: { select: { displayName: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
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
    const [userCount, spaceCount, pageCount, commentCount] = await Promise.all([
      db.user.count(),
      db.space.count(),
      db.page.count({ where: { deletedAt: null } }),
      db.comment.count({ where: { deletedAt: null } }),
    ]);
    return { userCount, spaceCount, pageCount, commentCount };
  }
}

export const adminApi = new AdminService();
