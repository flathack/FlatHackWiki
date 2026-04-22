import { db } from '../../config/database.js';
import { ConflictError, NotFoundError } from '../../core/errors/app.errors.js';
import { Space, SpaceVisibility } from '@prisma/client';

class SpacesService {
  async list(userId: string) {
    return db.space.findMany({
      where: {
        OR: [
          { visibility: 'PUBLIC' },
          { ownerId: userId },
          { members: { some: { userId } } },
        ],
      },
      include: { owner: { select: { id: true, name: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async create(userId: string, data: { name: string; key: string; description?: string; visibility: SpaceVisibility }) {
    const existing = await db.space.findUnique({ where: { key: data.key } });
    if (existing) throw new ConflictError(`Space with key "${data.key}" already exists`);
    return db.space.create({
      data: { ...data, ownerId: userId },
      include: { owner: { select: { id: true, name: true } } },
    });
  }

  async getByKey(key: string) {
    const space = await db.space.findUnique({ where: { key }, include: { owner: { select: { id: true, name: true } } } });
    if (!space) throw new NotFoundError('Space', key);
    return space;
  }

  async update(key: string, data: Partial<Space>) {
    const space = await db.space.findUnique({ where: { key } });
    if (!space) throw new NotFoundError('Space', key);
    return db.space.update({ where: { key }, data });
  }

  async delete(key: string) {
    const space = await db.space.findUnique({ where: { key } });
    if (!space) throw new NotFoundError('Space', key);
    await db.space.delete({ where: { key } });
  }

  async listMembers(key: string) {
    const space = await db.space.findUnique({ where: { key }, include: { members: { include: { user: { select: { id: true, name: true, email: true } } } } } });
    if (!space) throw new NotFoundError('Space', key);
    return space.members;
  }

  async addMember(key: string, userId: string, role: string) {
    const space = await db.space.findUnique({ where: { key } });
    if (!space) throw new NotFoundError('Space', key);
    return db.spaceMember.create({ data: { spaceId: space.id, userId, role: role as any } });
  }

  async updateMember(key: string, userId: string, role: string) {
    const space = await db.space.findUnique({ where: { key } });
    if (!space) throw new NotFoundError('Space', key);
    return db.spaceMember.update({ where: { spaceId: space.id, userId }, data: { role: role as any } });
  }

  async removeMember(key: string, userId: string) {
    const space = await db.space.findUnique({ where: { key } });
    if (!space) throw new NotFoundError('Space', key);
    await db.spaceMember.delete({ where: { spaceId: space.id, userId } });
  }
}

export const spacesApi = new SpacesService();
