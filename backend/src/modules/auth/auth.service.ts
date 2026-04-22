import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { db } from '../../config/database.js'.js;
import { config } from '../../config/index.js'.js;
import { ConflictError, UnauthorizedError, NotFoundError } from '../../core/errors/app.errors.js'.js;
import type { RegisterInput, LoginInput } from '../dto/auth.dto.js'.js;

const BCRYPT_ROUNDS = 12;

export class AuthService {
  async register(input: RegisterInput) {
    const existingUser = await db.user.findUnique({
      where: { email: input.email },
    });

    if (existingUser) {
      throw new ConflictError('An account with this email already exists');
    }

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

    const user = await db.user.create({
      data: {
        email: input.email,
        passwordHash,
        name: input.name,
        profile: {
          create: {
            displayName: input.name,
          },
        },
      },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
      },
    });

    const tokens = await this.generateTokens(user.id, user.email);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      ...tokens,
    };
  }

  async login(input: LoginInput, ipAddress?: string, userAgent?: string) {
    const user = await db.user.findUnique({
      where: { email: input.email },
    });

    if (!user || user.status === 'DELETED') {
      throw new UnauthorizedError('Invalid email or password');
    }

    if (user.status === 'INACTIVE') {
      throw new UnauthorizedError('Account is inactive');
    }

    const validPassword = await bcrypt.compare(input.password, user.passwordHash);

    if (!validPassword) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const tokens = await this.generateTokens(user.id, user.email);

    await db.userSession.create({
      data: {
        userId: user.id,
        refreshToken: tokens.refreshToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        ipAddress,
        userAgent,
      },
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      ...tokens,
    };
  }

  async logout(refreshToken: string) {
    await db.userSession.deleteMany({
      where: { refreshToken },
    });
  }

  async refresh(refreshToken: string) {
    const session = await db.userSession.findUnique({
      where: { refreshToken },
      include: { user: true },
    });

    if (!session || session.expiresAt < new Date()) {
      throw new UnauthorizedError('Invalid or expired refresh token');
    }

    const tokens = await this.generateTokens(session.user.id, session.user.email);

    await db.userSession.update({
      where: { id: session.id },
      data: { refreshToken: tokens.refreshToken },
    });

    return tokens;
  }

  async getMe(userId: string) {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        status: true,
        createdAt: true,
        profile: true,
      },
    });

    if (!user) {
      throw new NotFoundError('User');
    }

    const globalRole = await this.getGlobalRole(userId);

    return {
      ...user,
      globalRole,
    };
  }

  async requestPasswordReset(email: string) {
    const user = await db.user.findUnique({
      where: { email },
    });

    if (!user || user.status === 'DELETED') {
      return { message: 'If an account exists, a reset email has been sent' };
    }

    console.log(`[AUTH] Password reset requested for: ${email}`);
    return { message: 'If an account exists, a reset email has been sent' };
  }

  private async generateTokens(userId: string, email: string) {
    const accessToken = jwt.sign(
      { sub: userId, email, type: 'access' },
      config.JWT_SECRET,
      { expiresIn: config.JWT_EXPIRES_IN }
    );

    const refreshToken = randomUUID();

    return {
      accessToken,
      refreshToken,
      expiresIn: 900,
    };
  }

  private async getGlobalRole(userId: string): Promise<string> {
    const assignment = await db.roleAssignment.findFirst({
      where: {
        principalType: 'user',
        principalId: userId,
        scopeType: 'GLOBAL',
      },
    });

    return assignment?.roleName || 'USER';
  }
}

export const authService = new AuthService();
