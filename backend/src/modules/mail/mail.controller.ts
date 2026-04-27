import { Request, Response, NextFunction } from 'express';
import { mailService } from './mail.service.js';

class MailController {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      res.json(await mailService.getMailbox(req.user!.id, req.query as any));
    } catch (error) {
      next(error);
    }
  }

  async widget(req: Request, res: Response, next: NextFunction) {
    try {
      res.json(await mailService.getWidgetState(req.user!.id));
    } catch (error) {
      next(error);
    }
  }

  async accounts(req: Request, res: Response, next: NextFunction) {
    try {
      res.json(await mailService.listAccounts(req.user!.id));
    } catch (error) {
      next(error);
    }
  }

  async createAccount(req: Request, res: Response, next: NextFunction) {
    try {
      res.status(201).json(await mailService.createAccount(req.user!.id, req.body));
    } catch (error) {
      next(error);
    }
  }

  async testAccount(req: Request, res: Response, next: NextFunction) {
    try {
      res.json(await mailService.testAccount(req.body));
    } catch (error) {
      next(error);
    }
  }

  async updateAccount(req: Request, res: Response, next: NextFunction) {
    try {
      res.json(await mailService.updateAccount(req.user!.id, req.params.accountId, req.body));
    } catch (error) {
      next(error);
    }
  }

  async deleteAccount(req: Request, res: Response, next: NextFunction) {
    try {
      res.json(await mailService.deleteAccount(req.user!.id, req.params.accountId));
    } catch (error) {
      next(error);
    }
  }

  async syncAll(req: Request, res: Response, next: NextFunction) {
    try {
      res.json(await mailService.syncAll(req.user!.id));
    } catch (error) {
      next(error);
    }
  }

  async syncAccount(req: Request, res: Response, next: NextFunction) {
    try {
      res.json(await mailService.syncAccount(req.user!.id, req.params.accountId));
    } catch (error) {
      next(error);
    }
  }

  async getMessage(req: Request, res: Response, next: NextFunction) {
    try {
      res.json(await mailService.getMessage(req.user!.id, req.params.messageId));
    } catch (error) {
      next(error);
    }
  }

  async updateMessage(req: Request, res: Response, next: NextFunction) {
    try {
      res.json(await mailService.updateMessage(req.user!.id, req.params.messageId, req.body));
    } catch (error) {
      next(error);
    }
  }
}

export const mailController = new MailController();
