import { Request, Response, NextFunction } from 'express';
import { authService } from './auth.service.js';
import { config } from '../../config/index.js';

class AuthController {
  async register(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await authService.register(req.body);
      
      res.status(201).json({
        message: 'Registration successful',
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }

  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await authService.login(
        req.body,
        req.ip,
        req.headers['user-agent']
      );
      
      res.json({
        message: 'Login successful',
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }

  async logout(req: Request, res: Response, next: NextFunction) {
    try {
      const { refreshToken } = req.body;
      
      if (refreshToken) {
        await authService.logout(refreshToken);
      }
      
      res.json({ message: 'Logout successful' });
    } catch (error) {
      next(error);
    }
  }

  async refresh(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await authService.refresh(req.body.refreshToken);
      
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async oidcConfig(_req: Request, res: Response, next: NextFunction) {
    try {
      res.json(authService.getOidcPublicConfig());
    } catch (error) {
      next(error);
    }
  }

  async oidcLogin(req: Request, res: Response, next: NextFunction) {
    try {
      const returnTo = typeof req.query.returnTo === 'string' ? req.query.returnTo : '/';
      const loginUrl = await authService.getOidcAuthorizationUrl(returnTo);
      res.redirect(loginUrl);
    } catch (error) {
      next(error);
    }
  }

  async oidcCallback(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await authService.handleOidcCallback(
        typeof req.query.code === 'string' ? req.query.code : undefined,
        typeof req.query.state === 'string' ? req.query.state : undefined,
        req.ip,
        req.headers['user-agent']
      );

      const redirectUrl = new URL('/login', config.FRONTEND_URL);
      redirectUrl.searchParams.set('oidc_access', result.accessToken);
      redirectUrl.searchParams.set('oidc_refresh', result.refreshToken);
      redirectUrl.searchParams.set('returnTo', result.returnTo);
      res.redirect(redirectUrl.toString());
    } catch (error) {
      next(error);
    }
  }

  async oidcLogout(_req: Request, res: Response, next: NextFunction) {
    try {
      const logoutUrl = await authService.getOidcLogoutUrl();
      res.redirect(logoutUrl);
    } catch (error) {
      next(error);
    }
  }

  async me(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await authService.getMe(req.user!.id);
      
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async requestPasswordReset(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await authService.requestPasswordReset(req.body.email);
      
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async updateMe(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await authService.updateMe(req.user!.id, req.body);
      res.json({
        message: 'Profile updated successfully',
        ...result,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const authController = new AuthController();
