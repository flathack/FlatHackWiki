import bcrypt from 'bcrypt';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { Role } from '@prisma/client';
import { db } from '../../config/database.js';
import { config } from '../../config/index.js';
import { AppError, ConflictError, UnauthorizedError, NotFoundError, ValidationError } from '../../core/errors/app.errors.js';
import type { RegisterInput, LoginInput, UpdateMeInput } from './dto/auth.dto.js';

const BCRYPT_ROUNDS = 12;
const OIDC_STATE_EXPIRES_IN = '10m';
const OIDC_PROVIDER_KEY = 'oidc';

interface OidcMetadata {
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
  end_session_endpoint?: string;
}

interface OidcUserInfo {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  preferred_username?: string;
}

interface OidcTokenResponse {
  access_token: string;
  id_token?: string;
}

interface OidcState {
  type: 'oidc_state';
  returnTo?: string;
}

export class AuthService {
  async register(input: RegisterInput) {
    this.assertSelfRegistrationEnabled();

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
            dashboardSubtitle:
              'Build a personal start page for the wiki with widgets, quick links, favorite spaces, and notes.',
            showDashboardSubtitle: true,
            uiRadius: 28,
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

    const tokens = await this.createSession(user.id, user.email);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        displayName: user.name,
        dashboardSubtitle:
          'Build a personal start page for the wiki with widgets, quick links, favorite spaces, and notes.',
        showDashboardSubtitle: true,
        uiRadius: 28,
        globalRole: 'USER',
      },
      ...tokens,
    };
  }

  async login(input: LoginInput, ipAddress?: string, userAgent?: string) {
    this.assertLocalLoginEnabled();

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

    const tokens = await this.createSession(user.id, user.email, ipAddress, userAgent);
    const globalRole = await this.getGlobalRole(user.id);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        displayName: user.name,
        globalRole,
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
    const session = await db.userSession.findFirst({
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

  getOidcPublicConfig() {
    return {
      enabled: config.OIDC_ENABLED,
      providerName: config.OIDC_PROVIDER_NAME,
      loginUrl: config.OIDC_ENABLED ? '/auth/oidc/login' : null,
      logoutUrl: config.OIDC_ENABLED ? '/auth/oidc/logout' : null,
      localLoginEnabled: config.AUTH_LOCAL_LOGIN_ENABLED,
      selfRegistrationEnabled: config.AUTH_SELF_REGISTRATION_ENABLED,
    };
  }

  async getOidcAuthorizationUrl(returnTo?: string) {
    this.assertOidcConfigured();
    const metadata = await this.getOidcMetadata();
    const state = jwt.sign(
      {
        type: 'oidc_state',
        returnTo: this.normalizeReturnTo(returnTo),
      } satisfies OidcState,
      config.JWT_SECRET,
      { expiresIn: OIDC_STATE_EXPIRES_IN }
    );

    const url = new URL(this.toPublicOidcEndpoint(metadata.authorization_endpoint));
    url.searchParams.set('client_id', config.OIDC_CLIENT_ID!);
    url.searchParams.set('redirect_uri', this.getOidcRedirectUri());
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', config.OIDC_SCOPES);
    url.searchParams.set('state', state);

    return url.toString();
  }

  async handleOidcCallback(code: string | undefined, state: string | undefined, ipAddress?: string, userAgent?: string) {
    this.assertOidcConfigured();

    if (!code || !state) {
      throw new ValidationError('OIDC callback is missing code or state');
    }

    const decodedState = this.verifyOidcState(state);
    const metadata = await this.getOidcMetadata();
    const tokenResponse = await this.exchangeOidcCode(metadata.token_endpoint, code);
    const userInfo = await this.resolveOidcUserInfo(metadata.userinfo_endpoint, tokenResponse);
    const user = await this.upsertOidcUser(userInfo);
    const tokens = await this.createSession(user.id, user.email, ipAddress, userAgent);
    const globalRole = await this.getGlobalRole(user.id);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        displayName: user.name,
        globalRole,
      },
      returnTo: decodedState.returnTo || '/',
      ...tokens,
    };
  }

  async getOidcLogoutUrl() {
    this.assertOidcConfigured();
    const metadata = await this.getOidcMetadata();
    const logoutEndpoint =
      metadata.end_session_endpoint ||
      `${config.OIDC_ISSUER!.replace(/\/$/, '')}/protocol/openid-connect/logout`;
    const url = new URL(this.toPublicOidcEndpoint(logoutEndpoint));
    url.searchParams.set('client_id', config.OIDC_CLIENT_ID!);
    url.searchParams.set('post_logout_redirect_uri', `${config.FRONTEND_URL}/login`);

    return url.toString();
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
        profile: {
          select: {
            displayName: true,
            avatarUrl: true,
            timezone: true,
            locale: true,
            dashboardSubtitle: true,
            showDashboardSubtitle: true,
            uiRadius: true,
            nextcloudUsername: true,
            nextcloudAppPassword: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundError('User');
    }

    const globalRole = await this.getGlobalRole(userId);

    const safeProfile = user.profile
      ? {
          displayName: user.profile.displayName,
          avatarUrl: user.profile.avatarUrl,
          timezone: user.profile.timezone,
          locale: user.profile.locale,
          dashboardSubtitle: user.profile.dashboardSubtitle,
          showDashboardSubtitle: user.profile.showDashboardSubtitle,
          uiRadius: user.profile.uiRadius,
          nextcloudUsername: user.profile.nextcloudUsername,
        }
      : null;

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      status: user.status,
      createdAt: user.createdAt,
      profile: safeProfile,
      displayName: user.profile?.displayName || user.name,
      dashboardSubtitle:
        user.profile?.dashboardSubtitle ||
        'Build a personal start page for the wiki with widgets, quick links, favorite spaces, and notes.',
      showDashboardSubtitle: user.profile?.showDashboardSubtitle ?? true,
      uiRadius: user.profile?.uiRadius ?? 28,
      nextcloudUsername: user.profile?.nextcloudUsername || null,
      hasNextcloudAppPassword: Boolean(user.profile?.nextcloudAppPassword),
      globalRole,
    };
  }

  async updateMe(userId: string, input: UpdateMeInput) {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        profile: true,
      },
    });

    if (!user) {
      throw new NotFoundError('User');
    }

    const displayName = input.displayName?.trim();
    const dashboardSubtitle =
      input.dashboardSubtitle === undefined
        ? undefined
        : input.dashboardSubtitle === null
          ? null
          : input.dashboardSubtitle.trim();
    const uiRadius = input.uiRadius;
    const nextcloudUsername =
      input.nextcloudUsername === undefined
        ? undefined
        : input.nextcloudUsername === null
          ? null
          : input.nextcloudUsername.trim();
    const nextcloudAppPassword =
      input.nextcloudAppPassword === undefined
        ? undefined
        : input.nextcloudAppPassword === null
          ? null
          : input.nextcloudAppPassword.trim();

    await db.user.update({
      where: { id: userId },
      data: {
        ...(displayName ? { name: displayName } : {}),
        profile: {
          upsert: {
            create: {
              displayName: displayName || user.name,
              dashboardSubtitle:
                dashboardSubtitle === undefined
                  ? 'Build a personal start page for the wiki with widgets, quick links, favorite spaces, and notes.'
                  : dashboardSubtitle,
              showDashboardSubtitle: input.showDashboardSubtitle ?? true,
              uiRadius: uiRadius ?? 28,
              nextcloudUsername: nextcloudUsername === undefined ? null : nextcloudUsername,
              nextcloudAppPassword: nextcloudAppPassword === undefined ? null : nextcloudAppPassword,
            },
            update: {
              ...(displayName ? { displayName } : {}),
              ...(dashboardSubtitle !== undefined ? { dashboardSubtitle } : {}),
              ...(input.showDashboardSubtitle !== undefined
                ? { showDashboardSubtitle: input.showDashboardSubtitle }
                : {}),
              ...(uiRadius !== undefined ? { uiRadius } : {}),
              ...(nextcloudUsername !== undefined ? { nextcloudUsername } : {}),
              ...(nextcloudAppPassword !== undefined ? { nextcloudAppPassword } : {}),
            },
          },
        },
      },
    });

    return this.getMe(userId);
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
    const signOptions: SignOptions = {
      expiresIn: config.JWT_EXPIRES_IN as SignOptions['expiresIn'],
    };

    const accessToken = jwt.sign(
      { sub: userId, email, type: 'access' },
      config.JWT_SECRET,
      signOptions
    );

    const refreshToken = randomUUID();

    return {
      accessToken,
      refreshToken,
      expiresIn: 900,
    };
  }

  private async createSession(userId: string, email: string, ipAddress?: string, userAgent?: string) {
    const tokens = await this.generateTokens(userId, email);

    await db.userSession.create({
      data: {
        userId,
        refreshToken: tokens.refreshToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        ipAddress,
        userAgent,
      },
    });

    return tokens;
  }

  private assertOidcConfigured() {
    if (!config.OIDC_ENABLED) {
      throw new AppError(404, 'OIDC_DISABLED', 'OIDC login is not enabled');
    }

    if (!config.OIDC_ISSUER || !config.OIDC_CLIENT_ID || !config.OIDC_CLIENT_SECRET) {
      throw new AppError(500, 'OIDC_NOT_CONFIGURED', 'OIDC login is enabled but not fully configured');
    }
  }

  private assertLocalLoginEnabled() {
    if (!config.AUTH_LOCAL_LOGIN_ENABLED) {
      throw new AppError(404, 'LOCAL_LOGIN_DISABLED', 'Local login is disabled');
    }
  }

  private assertSelfRegistrationEnabled() {
    if (!config.AUTH_SELF_REGISTRATION_ENABLED) {
      throw new AppError(404, 'SELF_REGISTRATION_DISABLED', 'Self registration is disabled');
    }
  }

  private getOidcRedirectUri() {
    return config.OIDC_REDIRECT_URI || `${config.APP_URL}/api/v1/auth/oidc/callback`;
  }

  private async getOidcMetadata(): Promise<OidcMetadata> {
    const issuer = config.OIDC_ISSUER!.replace(/\/$/, '');
    const response = await fetch(`${issuer}/.well-known/openid-configuration`);

    if (!response.ok) {
      throw new AppError(502, 'OIDC_DISCOVERY_FAILED', 'OIDC discovery endpoint could not be loaded');
    }

    const metadata = (await response.json()) as Partial<OidcMetadata>;

    if (!metadata.authorization_endpoint || !metadata.token_endpoint || !metadata.userinfo_endpoint) {
      throw new AppError(502, 'OIDC_DISCOVERY_INVALID', 'OIDC discovery response is missing required endpoints');
    }

    return metadata as OidcMetadata;
  }

  private toPublicOidcEndpoint(endpoint: string) {
    if (!config.OIDC_PUBLIC_ISSUER || !config.OIDC_ISSUER) {
      return endpoint;
    }

    return endpoint.replace(config.OIDC_ISSUER.replace(/\/$/, ''), config.OIDC_PUBLIC_ISSUER.replace(/\/$/, ''));
  }

  private verifyOidcState(state: string) {
    try {
      const decoded = jwt.verify(state, config.JWT_SECRET) as OidcState;
      if (decoded.type !== 'oidc_state') {
        throw new Error('Unexpected state token');
      }
      return decoded;
    } catch {
      throw new UnauthorizedError('Invalid or expired OIDC state');
    }
  }

  private async exchangeOidcCode(tokenEndpoint: string, code: string): Promise<OidcTokenResponse> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.getOidcRedirectUri(),
    });

    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
    };

    if (config.OIDC_TOKEN_AUTH_METHOD === 'client_secret_basic') {
      headers.Authorization = `Basic ${Buffer.from(`${config.OIDC_CLIENT_ID}:${config.OIDC_CLIENT_SECRET}`).toString('base64')}`;
      body.set('client_id', config.OIDC_CLIENT_ID!);
    } else {
      body.set('client_id', config.OIDC_CLIENT_ID!);
      body.set('client_secret', config.OIDC_CLIENT_SECRET!);
    }

    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers,
      body,
    });

    if (!response.ok) {
      throw new UnauthorizedError('OIDC token exchange failed');
    }

    const tokenResponse = (await response.json()) as { access_token?: string; id_token?: string };
    if (!tokenResponse.access_token) {
      throw new UnauthorizedError('OIDC provider did not return an access token');
    }

    return { access_token: tokenResponse.access_token, id_token: tokenResponse.id_token };
  }

  private async resolveOidcUserInfo(
    userinfoEndpoint: string,
    tokenResponse: OidcTokenResponse
  ): Promise<Required<Pick<OidcUserInfo, 'sub' | 'email'>> & OidcUserInfo> {
    try {
      return await this.fetchOidcUserInfo(userinfoEndpoint, tokenResponse.access_token);
    } catch (error) {
      if (!tokenResponse.id_token) {
        throw error;
      }

      return this.parseOidcIdToken(tokenResponse.id_token);
    }
  }

  private parseOidcIdToken(idToken: string): Required<Pick<OidcUserInfo, 'sub' | 'email'>> & OidcUserInfo {
    const decoded = jwt.decode(idToken) as OidcUserInfo | null;

    if (!decoded?.sub || !decoded.email) {
      throw new UnauthorizedError('OIDC identity token is missing subject or email');
    }

    return {
      ...decoded,
      sub: decoded.sub,
      email: decoded.email.toLowerCase(),
    };
  }

  private async fetchOidcUserInfo(userinfoEndpoint: string, accessToken: string): Promise<Required<Pick<OidcUserInfo, 'sub' | 'email'>> & OidcUserInfo> {
    const response = await fetch(userinfoEndpoint, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      throw new UnauthorizedError(
        errorBody ? `OIDC user profile could not be loaded: ${response.status} ${errorBody}` : 'OIDC user profile could not be loaded'
      );
    }

    const userInfo = (await response.json()) as OidcUserInfo;

    if (!userInfo.sub || !userInfo.email) {
      throw new UnauthorizedError('OIDC user profile is missing subject or email');
    }

    return {
      ...userInfo,
      sub: userInfo.sub,
      email: userInfo.email.toLowerCase(),
    };
  }

  private async upsertOidcUser(userInfo: Required<Pick<OidcUserInfo, 'sub' | 'email'>> & OidcUserInfo) {
    const name = userInfo.name || userInfo.preferred_username || userInfo.email;
    const username = userInfo.preferred_username?.trim() || userInfo.email.split('@')[0]?.trim() || null;
    const existingIdentity = await db.externalIdentity.findUnique({
      where: {
        provider_subject: {
          provider: OIDC_PROVIDER_KEY,
          subject: userInfo.sub,
        },
      },
      include: { user: true },
    });

    if (existingIdentity) {
      await db.externalIdentity.update({
        where: { id: existingIdentity.id },
        data: {
          email: userInfo.email,
          username,
          name,
        },
      });

      if (existingIdentity.user.status === 'DELETED') {
        throw new UnauthorizedError('Account is deleted');
      }

      return existingIdentity.user;
    }

    const existingUser = await db.user.findUnique({
      where: { email: userInfo.email },
    });

    if (existingUser && existingUser.status === 'DELETED') {
      throw new UnauthorizedError('Account is deleted');
    }

    const user =
      existingUser ||
      (await db.user.create({
        data: {
          email: userInfo.email,
          name,
          emailVerified: userInfo.email_verified ?? true,
          passwordHash: await bcrypt.hash(`oidc:${randomUUID()}`, BCRYPT_ROUNDS),
          profile: {
            create: {
              displayName: name,
              dashboardSubtitle:
                'Build a personal start page for the wiki with widgets, quick links, favorite spaces, and notes.',
              showDashboardSubtitle: true,
              uiRadius: 28,
            },
          },
        },
      }));

    await db.externalIdentity.create({
      data: {
        userId: user.id,
        provider: OIDC_PROVIDER_KEY,
        subject: userInfo.sub,
        email: userInfo.email,
        username,
        name,
      },
    });

    await this.ensureDefaultOidcRole(user.id, userInfo.email);

    return user;
  }

  private async ensureDefaultOidcRole(userId: string, email: string) {
    const existing = await db.roleAssignment.findFirst({
      where: {
        principalType: 'user',
        principalId: userId,
        scopeType: 'GLOBAL',
      },
    });

    if (!existing) {
      const roleName = this.getDefaultOidcRoleForEmail(email);
      await db.roleAssignment.create({
        data: {
          roleName,
          scopeType: 'GLOBAL',
          principalType: 'user',
          principalId: userId,
        },
      });
    }
  }

  private getDefaultOidcRoleForEmail(email: string) {
    const superAdminEmails = config.OIDC_SUPER_ADMIN_EMAILS.split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);

    if (superAdminEmails.includes(email.toLowerCase())) {
      return Role.SUPER_ADMIN;
    }

    return config.OIDC_DEFAULT_ROLE as Role;
  }

  private normalizeReturnTo(returnTo?: string) {
    if (!returnTo || !returnTo.startsWith('/') || returnTo.startsWith('//')) {
      return '/';
    }

    return returnTo;
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
