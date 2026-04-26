import bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { db } from '../../config/database.js';
import { config } from '../../config/index.js';
import { AppError, ConflictError, ForbiddenError, NotFoundError } from '../../core/errors/app.errors.js';
import type { CreateUserInput, UpdateUserInput } from './dto/admin.dto.js';

const BCRYPT_ROUNDS = 12;

type KeycloakUserRecord = {
  id: string;
  username?: string;
  email?: string;
};

class AdminService {
  async createUser(input: CreateUserInput) {
    const normalizedEmail = input.email.trim().toLowerCase();
    const normalizedUsername = input.username.trim();
    const firstName = input.firstName.trim();
    const lastName = input.lastName.trim();
    const displayName = `${firstName} ${lastName}`.trim() || normalizedUsername;
    const roleName = input.globalRole ?? config.OIDC_DEFAULT_ROLE;

    const keycloakUser = await this.createKeycloakUser({
      username: normalizedUsername,
      email: normalizedEmail,
      firstName,
      lastName,
      password: input.password,
    });

    try {
      const userId = await db.$transaction(async (tx) => {
        const existingUser = await tx.user.findUnique({ where: { email: normalizedEmail } });

        if (existingUser?.status === 'DELETED') {
          throw new ConflictError('Ein geloeschter Wiki-Benutzer mit dieser E-Mail existiert bereits.');
        }

        const passwordHash = await bcrypt.hash(`oidc:${randomUUID()}`, BCRYPT_ROUNDS);

        const wikiUser =
          existingUser ||
          (await tx.user.create({
            data: {
              email: normalizedEmail,
              passwordHash,
              name: displayName,
              emailVerified: true,
            },
          }));

        await tx.user.update({
          where: { id: wikiUser.id },
          data: {
            name: displayName,
            emailVerified: true,
            profile: {
              upsert: {
                create: {
                  displayName,
                  dashboardSubtitle:
                    'Build a personal start page for the wiki with widgets, quick links, favorite spaces, and notes.',
                  showDashboardSubtitle: true,
                  uiRadius: 28,
                },
                update: {
                  displayName,
                },
              },
            },
          },
        });

        await tx.externalIdentity.upsert({
          where: {
            provider_subject: {
              provider: 'oidc',
              subject: keycloakUser.id,
            },
          },
          create: {
            userId: wikiUser.id,
            provider: 'oidc',
            subject: keycloakUser.id,
            email: normalizedEmail,
            username: normalizedUsername,
            name: displayName,
          },
          update: {
            userId: wikiUser.id,
            email: normalizedEmail,
            username: normalizedUsername,
            name: displayName,
          },
        });

        await tx.roleAssignment.deleteMany({
          where: { principalType: 'user', principalId: wikiUser.id, scopeType: 'GLOBAL' },
        });

        await tx.roleAssignment.create({
          data: {
            principalType: 'user',
            principalId: wikiUser.id,
            scopeType: 'GLOBAL',
            roleName,
          },
        });

        return wikiUser.id;
      });

      return this.getUser(userId);
    } catch (error) {
      await this.deleteKeycloakUser(keycloakUser.id).catch(() => undefined);
      throw error;
    }
  }

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

  private assertKeycloakProvisioningConfigured() {
    if (!config.KEYCLOAK_URL || !config.KEYCLOAK_ADMIN || !config.KEYCLOAK_ADMIN_PASSWORD || !config.OIDC_REALM) {
      throw new AppError(500, 'KEYCLOAK_PROVISIONING_NOT_CONFIGURED', 'Keycloak provisioning is not fully configured');
    }
  }

  private async createKeycloakUser(input: {
    username: string;
    email: string;
    firstName: string;
    lastName: string;
    password: string;
  }) {
    this.assertKeycloakProvisioningConfigured();

    const adminToken = await this.getKeycloakAdminAccessToken();

    if (await this.findKeycloakUserByUsername(input.username, adminToken)) {
      throw new ConflictError('Ein OIDC-Benutzer mit diesem Benutzernamen existiert bereits.');
    }

    if (await this.findKeycloakUserByEmail(input.email, adminToken)) {
      throw new ConflictError('Ein OIDC-Benutzer mit dieser E-Mail existiert bereits.');
    }

    const response = await this.keycloakRequest(`/admin/realms/${encodeURIComponent(config.OIDC_REALM)}/users`, adminToken, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: input.username,
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
        enabled: true,
        emailVerified: true,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      if (response.status === 409) {
        throw new ConflictError('Der OIDC-Benutzer existiert bereits.');
      }
      throw new AppError(502, 'KEYCLOAK_CREATE_USER_FAILED', body || 'Keycloak user could not be created');
    }

    const location = response.headers.get('location') || response.headers.get('Location');
    const userId = location?.split('/').pop();
    if (!userId) {
      throw new AppError(502, 'KEYCLOAK_CREATE_USER_INVALID', 'Keycloak did not return a user id');
    }

    const passwordResponse = await this.keycloakRequest(
      `/admin/realms/${encodeURIComponent(config.OIDC_REALM)}/users/${encodeURIComponent(userId)}/reset-password`,
      adminToken,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'password',
          temporary: false,
          value: input.password,
        }),
      }
    );

    if (!passwordResponse.ok) {
      const body = await passwordResponse.text().catch(() => '');
      throw new AppError(502, 'KEYCLOAK_SET_PASSWORD_FAILED', body || 'Keycloak password could not be set');
    }

    return { id: userId };
  }

  private async deleteKeycloakUser(userId: string) {
    this.assertKeycloakProvisioningConfigured();
    const adminToken = await this.getKeycloakAdminAccessToken();
    await this.keycloakRequest(`/admin/realms/${encodeURIComponent(config.OIDC_REALM)}/users/${encodeURIComponent(userId)}`, adminToken, {
      method: 'DELETE',
    });
  }

  private async findKeycloakUserByUsername(username: string, adminToken: string) {
    const response = await this.keycloakRequest(
      `/admin/realms/${encodeURIComponent(config.OIDC_REALM)}/users?username=${encodeURIComponent(username)}&exact=true`,
      adminToken
    );

    if (!response.ok) {
      throw new AppError(502, 'KEYCLOAK_QUERY_USER_FAILED', 'Keycloak user lookup failed');
    }

    const users = (await response.json()) as KeycloakUserRecord[];
    return users.some((entry) => entry.username?.toLowerCase() === username.toLowerCase());
  }

  private async findKeycloakUserByEmail(email: string, adminToken: string) {
    const response = await this.keycloakRequest(
      `/admin/realms/${encodeURIComponent(config.OIDC_REALM)}/users?email=${encodeURIComponent(email)}`,
      adminToken
    );

    if (!response.ok) {
      throw new AppError(502, 'KEYCLOAK_QUERY_USER_FAILED', 'Keycloak user lookup failed');
    }

    const users = (await response.json()) as KeycloakUserRecord[];
    return users.some((entry) => entry.email?.toLowerCase() === email.toLowerCase());
  }

  private async getKeycloakAdminAccessToken() {
    this.assertKeycloakProvisioningConfigured();

    const body = new URLSearchParams({
      grant_type: 'password',
      client_id: 'admin-cli',
      username: config.KEYCLOAK_ADMIN!,
      password: config.KEYCLOAK_ADMIN_PASSWORD!,
    });

    const response = await fetch(
      `${config.KEYCLOAK_URL!.replace(/\/$/, '')}/realms/${encodeURIComponent(config.KEYCLOAK_ADMIN_REALM)}/protocol/openid-connect/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      }
    );

    if (!response.ok) {
      const bodyText = await response.text().catch(() => '');
      throw new AppError(502, 'KEYCLOAK_ADMIN_LOGIN_FAILED', bodyText || 'Keycloak admin token could not be requested');
    }

    const tokenResponse = (await response.json()) as { access_token?: string };
    if (!tokenResponse.access_token) {
      throw new AppError(502, 'KEYCLOAK_ADMIN_LOGIN_INVALID', 'Keycloak admin token response is invalid');
    }

    return tokenResponse.access_token;
  }

  private keycloakRequest(path: string, adminToken: string, init: RequestInit = {}) {
    return fetch(`${config.KEYCLOAK_URL!.replace(/\/$/, '')}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${adminToken}`,
        ...(init.headers || {}),
      },
    });
  }
}

export const adminApi = new AdminService();
