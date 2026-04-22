import { db } from '../../config/database.js';
import { NotFoundError, ForbiddenError } from '../../core/errors/app.errors.js';
import fs from 'fs';

class AttachmentsService {
  async listByPage(pageId: string) {
    return db.attachment.findMany({
      where: { pageId, deletedAt: null },
      include: { uploader: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async upload(pageId: string, userId: string, originalName: string, mimeType: string, sizeBytes: number, storagePath: string) {
    return db.attachment.create({
      data: {
        pageId,
        uploaderId: userId,
        filename: storagePath.split('/').pop() || '',
        originalName,
        mimeType,
        sizeBytes,
        storageKey: storagePath,
      },
      include: { uploader: { select: { id: true, name: true } } },
    });
  }

  async getById(id: string) {
    const attachment = await db.attachment.findUnique({
      where: { id },
      include: { uploader: { select: { id: true, name: true } } },
    });
    if (!attachment) throw new NotFoundError('Attachment');
    return attachment;
  }

  async delete(id: string, userId: string) {
    const attachment = await db.attachment.findUnique({ where: { id } });
    if (!attachment) throw new NotFoundError('Attachment');
    if (attachment.uploaderId !== userId) throw new ForbiddenError('Can only delete your own attachments');
    await db.attachment.update({ where: { id }, data: { deletedAt: new Date() } });
    try {
      fs.unlinkSync(attachment.storageKey);
    } catch {}
  }
}

export const attachmentsApi = new AttachmentsService();
