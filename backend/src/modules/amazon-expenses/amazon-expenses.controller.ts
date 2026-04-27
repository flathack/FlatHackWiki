import { Request, Response, NextFunction } from 'express';
import { amazonExpensesService } from './amazon-expenses.service.js';

class AmazonExpensesController {
  async getDashboard(req: Request, res: Response, next: NextFunction) {
    try {
      res.json(await amazonExpensesService.getDashboard(req.user!.id, req.query as any));
    } catch (error) {
      next(error);
    }
  }

  async getSummary(req: Request, res: Response, next: NextFunction) {
    try {
      res.json(await amazonExpensesService.getSummary(req.user!.id));
    } catch (error) {
      next(error);
    }
  }

  async importCsv(req: Request, res: Response, next: NextFunction) {
    try {
      res.status(201).json(await amazonExpensesService.importCsv(req.user!.id, req.body.files));
    } catch (error) {
      next(error);
    }
  }

  async createOrder(req: Request, res: Response, next: NextFunction) {
    try {
      res.status(201).json(await amazonExpensesService.createOrder(req.user!.id, req.body));
    } catch (error) {
      next(error);
    }
  }

  async createPerson(req: Request, res: Response, next: NextFunction) {
    try {
      res.status(201).json(await amazonExpensesService.createPerson(req.user!.id, req.body));
    } catch (error) {
      next(error);
    }
  }

  async updatePerson(req: Request, res: Response, next: NextFunction) {
    try {
      res.json(await amazonExpensesService.updatePerson(req.user!.id, req.params.personId, req.body));
    } catch (error) {
      next(error);
    }
  }

  async deletePerson(req: Request, res: Response, next: NextFunction) {
    try {
      res.json(await amazonExpensesService.deletePerson(req.user!.id, req.params.personId));
    } catch (error) {
      next(error);
    }
  }

  async assignOrder(req: Request, res: Response, next: NextFunction) {
    try {
      res.json(await amazonExpensesService.assignOrder(req.user!.id, req.params.orderId, req.body.personId));
    } catch (error) {
      next(error);
    }
  }

  async updateSettings(req: Request, res: Response, next: NextFunction) {
    try {
      res.json(await amazonExpensesService.updateSettings(req.user!.id, req.body));
    } catch (error) {
      next(error);
    }
  }

  async markSettlementPaid(req: Request, res: Response, next: NextFunction) {
    try {
      res.json(await amazonExpensesService.markSettlementPaid(req.user!.id, req.body));
    } catch (error) {
      next(error);
    }
  }
}

export const amazonExpensesController = new AmazonExpensesController();
