import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { MailAccountStatus, MailSecurityMode, Prisma } from '@prisma/client';
import type { ParsedMail } from 'mailparser';
import db from '../../config/database.js';
import { config } from '../../config/index.js';
import { NotFoundError, ValidationError } from '../../core/errors/app.errors.js';

type MailAccountInput = {
  displayName?: string;
  email: string;
  username: string;
  password: string;
  imapHost: string;
  imapPort: number;
  securityMode: MailSecurityMode;
  syncNow?: boolean;
};

type MailQuery = {
  accountId?: string;
  folder?: string;
  q?: string;
  filter?: 'all' | 'unread' | 'flagged' | 'attachments';
  limit?: number;
  offset?: number;
};

const INBOX_PATH = 'INBOX';
const DEFAULT_LIMIT = 50;
const WIDGET_LIMIT = 20;
const AUTO_SYNC_STALE_MS = 60 * 1000;
const SYNC_WINDOW_SIZE = 150;
const PREVIEW_LENGTH = 240;

function credentialKey() {
  return createHash('sha256').update(config.MAIL_CREDENTIAL_SECRET || config.JWT_SECRET).digest();
}

function encryptSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', credentialKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64'), tag.toString('base64'), encrypted.toString('base64')].join(':');
}

function decryptSecret(value: string) {
  const [ivValue, tagValue, encryptedValue] = value.split(':');
  if (!ivValue || !tagValue || !encryptedValue) {
    throw new ValidationError('Gespeichertes Mail-Passwort hat ein ungültiges Format. Bitte Konto neu verbinden.');
  }

  const decipher = createDecipheriv('aes-256-gcm', credentialKey(), Buffer.from(ivValue, 'base64'));
  decipher.setAuthTag(Buffer.from(tagValue, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

function mapConnectionError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  if (lower.includes('auth') || lower.includes('login') || lower.includes('authentication')) {
    return 'Anmeldung fehlgeschlagen. Prüfe Benutzername, Passwort oder App-Passwort.';
  }
  if (lower.includes('certificate') || lower.includes('self-signed') || lower.includes('tls')) {
    return 'Die verschlüsselte Verbindung konnte nicht sicher hergestellt werden. Prüfe Server, Port und TLS-Einstellung.';
  }
  if (lower.includes('timeout') || lower.includes('timed out')) {
    return 'Der Mailserver antwortet zu langsam. Bitte später erneut testen oder Timeout/Serverdaten prüfen.';
  }
  if (lower.includes('enotfound') || lower.includes('econnrefused') || lower.includes('network')) {
    return 'Der Mailserver konnte nicht erreicht werden. Prüfe Serveradresse, Port und Netzwerk.';
  }

  return 'IMAP-Verbindung konnte nicht hergestellt werden. Prüfe Serverdaten und Zugangsdaten.';
}

function serializeAccount(account: any) {
  return {
    id: account.id,
    displayName: account.displayName,
    email: account.email,
    username: account.username,
    imapHost: account.imapHost,
    imapPort: account.imapPort,
    securityMode: account.securityMode,
    status: account.status,
    lastSyncAt: account.lastSyncAt,
    lastError: account.lastError,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  };
}

function serializeFolder(folder: any) {
  return {
    id: folder.id,
    accountId: folder.accountId,
    path: folder.path,
    displayName: folder.displayName,
    type: folder.type,
    unreadCount: folder.unreadCount,
    totalCount: folder.totalCount,
  };
}

function serializeMessage(message: any) {
  return {
    id: message.id,
    accountId: message.accountId,
    folderId: message.folderId,
    uid: message.uid,
    messageId: message.messageId,
    fromName: message.fromName,
    fromAddress: message.fromAddress,
    subject: message.subject,
    preview: message.preview,
    receivedAt: message.receivedAt,
    isRead: message.isRead,
    isFlagged: message.isFlagged,
    hasAttachments: message.hasAttachments,
  };
}

function normalizeAddress(addresses: any[] | undefined) {
  const first = Array.isArray(addresses) ? addresses[0] : null;
  return {
    name: first?.name ? String(first.name) : null,
    address: first?.address ? String(first.address) : 'unbekannt',
  };
}

function hasAttachments(bodyStructure: any): boolean {
  if (!bodyStructure) return false;
  if (bodyStructure.disposition?.toLowerCase?.() === 'attachment') return true;
  if (bodyStructure.parameters?.name || bodyStructure.dispositionParameters?.filename) return true;
  return Array.isArray(bodyStructure.childNodes) && bodyStructure.childNodes.some((node: any) => hasAttachments(node));
}

function textFromHtml(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function normalizeBodyText(value: string | null | undefined) {
  const text = (value ?? '').replace(/\r\n/g, '\n').replace(/[ \t]+\n/g, '\n').trim();
  return text || null;
}

function createPreview(value: string | null | undefined) {
  const preview = (value ?? '').replace(/\s+/g, ' ').trim();
  return preview ? preview.slice(0, PREVIEW_LENGTH) : null;
}

async function parseMessageSource(source: Buffer | string | null | undefined) {
  if (!source) {
    return { bodyText: null, bodyHtml: null, preview: null, hasAttachments: false };
  }

  try {
    const { simpleParser } = await import('mailparser');
    const parsed = await simpleParser(source) as ParsedMail;
    const html = typeof parsed.html === 'string' ? parsed.html : null;
    const bodyText = normalizeBodyText(parsed.text || (html ? textFromHtml(html) : null));
    return {
      bodyText,
      bodyHtml: html,
      preview: createPreview(bodyText),
      hasAttachments: parsed.attachments.length > 0,
    };
  } catch {
    return { bodyText: null, bodyHtml: null, preview: null, hasAttachments: false };
  }
}

async function createImapClient(input: {
  imapHost: string;
  imapPort: number;
  securityMode: MailSecurityMode;
  username: string;
  password: string;
}) {
  const { ImapFlow } = await import('imapflow');
  return new ImapFlow({
    host: input.imapHost,
    port: input.imapPort,
    secure: input.securityMode === 'SSL_TLS',
    doSTARTTLS: input.securityMode === 'STARTTLS',
    auth: {
      user: input.username,
      pass: input.password,
    },
    logger: false,
    connectionTimeout: 12_000,
    greetingTimeout: 12_000,
    socketTimeout: 30_000,
    tls: {
      rejectUnauthorized: input.securityMode !== 'NONE',
    },
  } as any);
}

async function testImapConnection(input: {
  imapHost: string;
  imapPort: number;
  securityMode: MailSecurityMode;
  username: string;
  password: string;
}) {
  const client = await createImapClient(input);
  try {
    await client.connect();
    await client.mailboxOpen(INBOX_PATH);
    return { ok: true, message: 'IMAP-Verbindung erfolgreich getestet.' };
  } finally {
    try {
      await client.logout();
    } catch {
      // ignore logout failures after connection errors
    }
  }
}

class MailService {
  private readonly syncLocks = new Map<string, Promise<unknown>>();

  private async syncAccountOnce(userId: string, accountId: string) {
    const key = `${userId}:${accountId}`;
    const existing = this.syncLocks.get(key);
    if (existing) {
      await existing;
      return this.getAccount(userId, accountId);
    }

    const promise = this.syncAccount(userId, accountId).finally(() => {
      this.syncLocks.delete(key);
    });
    this.syncLocks.set(key, promise);
    return promise;
  }

  private async syncStaleAccounts(userId: string, accountId?: string) {
    const staleBefore = new Date(Date.now() - AUTO_SYNC_STALE_MS);
    const accounts = await db.mailAccount.findMany({
      where: {
        userId,
        id: accountId,
        status: { not: MailAccountStatus.DISABLED },
        OR: [{ lastSyncAt: null }, { lastSyncAt: { lt: staleBefore } }, { status: MailAccountStatus.NEEDS_ATTENTION }],
      },
      select: { id: true },
    });

    await Promise.all(accounts.map((account) => this.syncAccountOnce(userId, account.id).catch(() => null)));
  }

  async testAccount(input: MailAccountInput) {
    try {
      return await testImapConnection(input);
    } catch (error) {
      return { ok: false, message: mapConnectionError(error) };
    }
  }

  async createAccount(userId: string, input: MailAccountInput) {
    const test = await this.testAccount(input);
    if (!test.ok) {
      throw new ValidationError(test.message);
    }

    const account = await db.mailAccount.create({
      data: {
        userId,
        displayName: input.displayName?.trim() || input.email,
        email: input.email,
        username: input.username,
        imapHost: input.imapHost,
        imapPort: input.imapPort,
        securityMode: input.securityMode,
        encryptedPassword: encryptSecret(input.password),
        status: MailAccountStatus.ACTIVE,
      },
    });

    if (input.syncNow !== false) {
      await this.syncAccount(userId, account.id);
    }

    return this.getAccount(userId, account.id);
  }

  async listAccounts(userId: string) {
    const accounts = await db.mailAccount.findMany({
      where: { userId },
      orderBy: [{ status: 'asc' }, { displayName: 'asc' }],
    });
    return accounts.map(serializeAccount);
  }

  async getAccount(userId: string, accountId: string) {
    const account = await db.mailAccount.findFirst({ where: { id: accountId, userId } });
    if (!account) throw new NotFoundError('Mail account', accountId);
    return serializeAccount(account);
  }

  async updateAccount(userId: string, accountId: string, input: Partial<MailAccountInput> & { status?: MailAccountStatus }) {
    const current = await db.mailAccount.findFirst({ where: { id: accountId, userId } });
    if (!current) throw new NotFoundError('Mail account', accountId);

    const data: Prisma.MailAccountUpdateInput = {
      displayName: input.displayName,
      email: input.email,
      username: input.username,
      imapHost: input.imapHost,
      imapPort: input.imapPort,
      securityMode: input.securityMode,
      status: input.status,
      encryptedPassword: input.password ? encryptSecret(input.password) : undefined,
      lastError: null,
    };

    const account = await db.mailAccount.update({
      where: { id: accountId },
      data,
    });

    return serializeAccount(account);
  }

  async deleteAccount(userId: string, accountId: string) {
    const account = await db.mailAccount.findFirst({ where: { id: accountId, userId } });
    if (!account) throw new NotFoundError('Mail account', accountId);
    await db.mailAccount.delete({ where: { id: accountId } });
    return { deleted: true };
  }

  async getMailbox(userId: string, query: MailQuery = {}) {
    await this.syncStaleAccounts(userId, query.accountId);

    const limit = query.limit ?? DEFAULT_LIMIT;
    const offset = query.offset ?? 0;
    const accounts = await db.mailAccount.findMany({ where: { userId }, orderBy: { displayName: 'asc' } });
    const folders = await db.mailFolder.findMany({ where: { userId }, orderBy: [{ type: 'asc' }, { displayName: 'asc' }] });

    const where: Prisma.MailMessageWhereInput = {
      userId,
      accountId: query.accountId,
      folder: query.folder ? { path: query.folder } : undefined,
    };

    if (query.filter === 'unread') where.isRead = false;
    if (query.filter === 'flagged') where.isFlagged = true;
    if (query.filter === 'attachments') where.hasAttachments = true;
    if (query.q) {
      where.OR = [
        { subject: { contains: query.q, mode: 'insensitive' } },
        { fromName: { contains: query.q, mode: 'insensitive' } },
        { fromAddress: { contains: query.q, mode: 'insensitive' } },
        { preview: { contains: query.q, mode: 'insensitive' } },
      ];
    }

    const [messages, total, unreadCount] = await Promise.all([
      db.mailMessage.findMany({
        where,
        orderBy: { receivedAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      db.mailMessage.count({ where }),
      db.mailMessage.count({ where: { userId, isRead: false } }),
    ]);

    const errorAccounts = accounts.filter((account) => account.status === MailAccountStatus.NEEDS_ATTENTION);
    const status = accounts.length === 0 ? 'setup_required' : errorAccounts.length > 0 ? 'partial_error' : 'ready';

    return {
      status,
      message: accounts.length === 0 ? 'Noch kein E-Mail-Konto eingerichtet.' : errorAccounts[0]?.lastError ?? null,
      accounts: accounts.map(serializeAccount),
      folders: folders.map(serializeFolder),
      messages: messages.map(serializeMessage),
      total,
      unreadCount,
      lastSyncedAt: accounts
        .map((account) => account.lastSyncAt)
        .filter(Boolean)
        .sort((a, b) => b!.getTime() - a!.getTime())[0] ?? null,
    };
  }

  async getWidgetState(userId: string) {
    const state = await this.getMailbox(userId, { limit: WIDGET_LIMIT, folder: INBOX_PATH });
    return {
      status: state.status,
      message: state.message,
      accounts: state.accounts,
      messages: state.messages,
      unreadCount: state.unreadCount,
      total: state.total,
      lastSyncedAt: state.lastSyncedAt,
    };
  }

  async getMessage(userId: string, messageId: string) {
    const message = await db.mailMessage.findFirst({
      where: { id: messageId, userId },
      include: { account: true, folder: true },
    });
    if (!message) throw new NotFoundError('Mail message', messageId);
    return {
      ...serializeMessage(message),
      bodyText: message.bodyText,
      bodyHtml: message.bodyHtml,
      account: serializeAccount(message.account),
      folder: serializeFolder(message.folder),
    };
  }

  async updateMessage(userId: string, messageId: string, input: { isRead?: boolean; isFlagged?: boolean }) {
    const message = await db.mailMessage.findFirst({ where: { id: messageId, userId } });
    if (!message) throw new NotFoundError('Mail message', messageId);
    const updated = await db.mailMessage.update({ where: { id: messageId }, data: input });
    return serializeMessage(updated);
  }

  async syncAll(userId: string) {
    const accounts = await db.mailAccount.findMany({ where: { userId, status: { not: MailAccountStatus.DISABLED } } });
    const results = [];
    for (const account of accounts) {
      results.push(await this.syncAccountOnce(userId, account.id));
    }
    return { accounts: results };
  }

  async syncAccount(userId: string, accountId: string) {
    const account = await db.mailAccount.findFirst({ where: { id: accountId, userId } });
    if (!account) throw new NotFoundError('Mail account', accountId);
    if (account.status === MailAccountStatus.DISABLED) return serializeAccount(account);

    let client: any = null;
    try {
      client = await createImapClient({
        imapHost: account.imapHost,
        imapPort: account.imapPort,
        securityMode: account.securityMode,
        username: account.username,
        password: decryptSecret(account.encryptedPassword),
      });
      await client.connect();
      const mailbox = await client.mailboxOpen(INBOX_PATH);
      const folder = await db.mailFolder.upsert({
        where: {
          userId_accountId_path: {
            userId,
            accountId: account.id,
            path: INBOX_PATH,
          },
        },
        create: {
          userId,
          accountId: account.id,
          path: INBOX_PATH,
          displayName: 'Posteingang',
          type: 'INBOX',
          totalCount: mailbox.exists ?? 0,
        },
        update: {
          totalCount: mailbox.exists ?? 0,
        },
      });

      const exists = Number(mailbox.exists ?? 0);
      const start = Math.max(1, exists - (SYNC_WINDOW_SIZE - 1));
      if (exists > 0) {
        for await (const message of client.fetch(`${start}:*`, {
          uid: true,
          envelope: true,
          flags: true,
          bodyStructure: true,
          source: true,
        })) {
          const sender = normalizeAddress(message.envelope?.from);
          const flags = Array.from(message.flags ?? []).map((flag) => String(flag));
          const parsed = await parseMessageSource(message.source);
          const messageHasAttachments = hasAttachments(message.bodyStructure) || parsed.hasAttachments;
          await db.mailMessage.upsert({
            where: {
              userId_accountId_folderId_uid: {
                userId,
                accountId: account.id,
                folderId: folder.id,
                uid: Number(message.uid),
              },
            },
            create: {
              userId,
              accountId: account.id,
              folderId: folder.id,
              uid: Number(message.uid),
              messageId: message.envelope?.messageId ? String(message.envelope.messageId) : null,
              fromName: sender.name,
              fromAddress: sender.address,
              subject: message.envelope?.subject ? String(message.envelope.subject) : '',
              preview: parsed.preview,
              receivedAt: message.envelope?.date ? new Date(message.envelope.date) : new Date(),
              isRead: flags.includes('\\Seen'),
              isFlagged: flags.includes('\\Flagged'),
              hasAttachments: messageHasAttachments,
              bodyText: parsed.bodyText,
              bodyHtml: parsed.bodyHtml,
              rawFlags: flags,
            },
            update: {
              fromName: sender.name,
              fromAddress: sender.address,
              subject: message.envelope?.subject ? String(message.envelope.subject) : '',
              preview: parsed.preview,
              receivedAt: message.envelope?.date ? new Date(message.envelope.date) : new Date(),
              isRead: flags.includes('\\Seen'),
              isFlagged: flags.includes('\\Flagged'),
              hasAttachments: messageHasAttachments,
              bodyText: parsed.bodyText,
              bodyHtml: parsed.bodyHtml,
              rawFlags: flags,
            },
          });
        }
      }

      const unreadCount = await db.mailMessage.count({ where: { userId, accountId: account.id, folderId: folder.id, isRead: false } });
      await db.mailFolder.update({ where: { id: folder.id }, data: { unreadCount } });
      const updated = await db.mailAccount.update({
        where: { id: account.id },
        data: { status: MailAccountStatus.ACTIVE, lastSyncAt: new Date(), lastError: null },
      });
      return serializeAccount(updated);
    } catch (error) {
      const message = mapConnectionError(error);
      const updated = await db.mailAccount.update({
        where: { id: account.id },
        data: { status: MailAccountStatus.NEEDS_ATTENTION, lastError: message },
      });
      return serializeAccount(updated);
    } finally {
      if (client) {
        try {
          await client.logout();
        } catch {
          // ignore logout failures during sync cleanup
        }
      }
    }
  }
}

export const mailService = new MailService();
