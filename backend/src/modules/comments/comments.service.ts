import { db } from '../../config/database.js';
import { NotFoundError, ForbiddenError } from '../../core/errors/app.errors.js';

class CommentsService {
  async listByPage(pageId: string) {
    return db.comment.findMany({
      where: { pageId, deletedAt: null, status: 'VISIBLE' },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(pageId: string, userId: string, content: string) {
    return db.comment.create({
      data: { pageId, userId, content },
      include: { user: { select: { id: true, name: true } } },
    });
  }

  async update(commentId: string, userId: string, content: string) {
    const comment = await db.comment.findUnique({ where: { id: commentId } });
    if (!comment) throw new NotFoundError('Comment');
    if (comment.userId !== userId) throw new ForbiddenError('Can only edit your own comments');
    return db.comment.update({ where: { id: commentId }, data: { content } });
  }

  async delete(commentId: string, userId: string) {
    const comment = await db.comment.findUnique({ where: { id: commentId } });
    if (!comment) throw new NotFoundError('Comment');
    if (comment.userId !== userId) throw new ForbiddenError('Can only delete your own comments');
    await db.comment.update({ where: { id: commentId }, data: { deletedAt: new Date(), status: 'DELETED' } });
  }
}

export const commentsApi = new CommentsService();
