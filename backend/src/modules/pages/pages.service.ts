import { db } from '../../config/database.js';
import { NotFoundError, ConflictError } from '../../core/errors/app.errors.js';

class PagesService {
  async list(spaceKey: string) {
    const space = await db.space.findUnique({ where: { key: spaceKey } });
    if (!space) throw new NotFoundError('Space', spaceKey);
    return db.page.findMany({
      where: { spaceId: space.id, deletedAt: null },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      include: { creator: { select: { id: true, name: true } } },
    });
  }

  async create(spaceKey: string, userId: string, data: { title: string; slug: string; content?: string; parentId?: string }) {
    const space = await db.space.findUnique({ where: { key: spaceKey } });
    if (!space) throw new NotFoundError('Space', spaceKey);
    const existing = await db.page.findUnique({
      where: { spaceId_slug: { spaceId: space.id, slug: data.slug } },
    });
    if (existing) throw new ConflictError(`Page with slug "${data.slug}" already exists`);
    const page = await db.page.create({
      data: { ...data, spaceId: space.id, createdById: userId },
    });
    await db.pageVersion.create({ data: { pageId: page.id, versionNumber: 1, content: data.content || '', createdById: userId } });
    return page;
  }

  async getBySlug(spaceKey: string, slug: string) {
    const space = await db.space.findUnique({ where: { key: spaceKey } });
    if (!space) throw new NotFoundError('Space', spaceKey);
    const page = await db.page.findFirst({ where: { spaceId: space.id, slug, deletedAt: null } });
    if (!page) throw new NotFoundError('Page', slug);
    return page;
  }

  async update(spaceKey: string, slug: string, userId: string, data: { title?: string; content?: string }) {
    const space = await db.space.findUnique({ where: { key: spaceKey } });
    if (!space) throw new NotFoundError('Space', spaceKey);
    const page = await db.page.findFirst({ where: { spaceId: space.id, slug, deletedAt: null } });
    if (!page) throw new NotFoundError('Page', slug);
    const latestVersion = await db.pageVersion.findFirst({ where: { pageId: page.id }, orderBy: { versionNumber: 'desc' } });
    const newVersion = (latestVersion?.versionNumber || 0) + 1;
    if (data.content !== undefined) {
      await db.pageVersion.create({ data: { pageId: page.id, versionNumber: newVersion, content: data.content, createdById: userId } });
    }
    return db.page.update({ where: { id: page.id }, data: { title: data.title } });
  }

  async delete(spaceKey: string, slug: string) {
    const space = await db.space.findUnique({ where: { key: spaceKey } });
    if (!space) throw new NotFoundError('Space', spaceKey);
    const page = await db.page.findFirst({ where: { spaceId: space.id, slug, deletedAt: null } });
    if (!page) throw new NotFoundError('Page', slug);
    await db.page.update({ where: { id: page.id }, data: { deletedAt: new Date() } });
  }

  async getVersions(spaceKey: string, slug: string) {
    const space = await db.space.findUnique({ where: { key: spaceKey } });
    if (!space) throw new NotFoundError('Space', spaceKey);
    const page = await db.page.findFirst({ where: { spaceId: space.id, slug, deletedAt: null } });
    if (!page) throw new NotFoundError('Page', slug);
    return db.pageVersion.findMany({ where: { pageId: page.id }, orderBy: { versionNumber: 'desc' } });
  }
}

export const pagesApi = new PagesService();
