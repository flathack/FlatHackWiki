import { Request, Response, NextFunction } from 'express';
import { dashboardService } from './dashboard.service.js';

class DashboardController {
  async getDashboard(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await dashboardService.getDashboard(req.user!.id);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async createWidget(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await dashboardService.createWidget(req.user!.id, req.body);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  }

  async updateWidget(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await dashboardService.updateWidget(req.user!.id, req.params.widgetId, req.body);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async updateWidgetLayout(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await dashboardService.updateWidgetLayout(req.user!.id, req.body.widgets);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async deleteWidget(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await dashboardService.deleteWidget(req.user!.id, req.params.widgetId);
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async listBookmarks(req: Request, res: Response, next: NextFunction) {
    try {
      res.json(await dashboardService.listBookmarks(req.user!.id));
    } catch (error) {
      next(error);
    }
  }

  async createBookmark(req: Request, res: Response, next: NextFunction) {
    try {
      res.status(201).json(await dashboardService.createBookmark(req.user!.id, req.body));
    } catch (error) {
      next(error);
    }
  }

  async updateBookmark(req: Request, res: Response, next: NextFunction) {
    try {
      res.json(await dashboardService.updateBookmark(req.user!.id, req.params.bookmarkId, req.body));
    } catch (error) {
      next(error);
    }
  }

  async deleteBookmark(req: Request, res: Response, next: NextFunction) {
    try {
      res.json(await dashboardService.deleteBookmark(req.user!.id, req.params.bookmarkId));
    } catch (error) {
      next(error);
    }
  }

  async getCommute(req: Request, res: Response, next: NextFunction) {
    try {
      res.json(await dashboardService.getCommute(req.user!.id));
    } catch (error) {
      next(error);
    }
  }

  async getWeather(req: Request, res: Response, next: NextFunction) {
    try {
      const city = typeof req.query.city === 'string' ? req.query.city : '';
      res.json(await dashboardService.getWeather(city));
    } catch (error) {
      next(error);
    }
  }

  async sendTelegramMessage(req: Request, res: Response, next: NextFunction) {
    try {
      res.status(201).json(await dashboardService.sendTelegramMessage(req.user!.id, req.body.content));
    } catch (error) {
      next(error);
    }
  }

  async upsertCommute(req: Request, res: Response, next: NextFunction) {
    try {
      res.json(await dashboardService.upsertCommute(req.user!.id, req.body));
    } catch (error) {
      next(error);
    }
  }

  async getTimeTracking(req: Request, res: Response, next: NextFunction) {
    try {
      res.json(await dashboardService.getTimeTracking(req.user!.id));
    } catch (error) {
      next(error);
    }
  }

  async createTimeProject(req: Request, res: Response, next: NextFunction) {
    try {
      res.status(201).json(await dashboardService.createTimeProject(req.user!.id, req.body));
    } catch (error) {
      next(error);
    }
  }

  async updateTimeProject(req: Request, res: Response, next: NextFunction) {
    try {
      res.json(await dashboardService.updateTimeProject(req.user!.id, req.params.projectId, req.body));
    } catch (error) {
      next(error);
    }
  }

  async deleteTimeProject(req: Request, res: Response, next: NextFunction) {
    try {
      res.json(await dashboardService.deleteTimeProject(req.user!.id, req.params.projectId));
    } catch (error) {
      next(error);
    }
  }

  async startTimer(req: Request, res: Response, next: NextFunction) {
    try {
      res.status(201).json(await dashboardService.startTimer(req.user!.id, req.body));
    } catch (error) {
      next(error);
    }
  }

  async stopTimer(req: Request, res: Response, next: NextFunction) {
    try {
      res.json(await dashboardService.stopTimer(req.user!.id, req.params.entryId, req.body.endTime));
    } catch (error) {
      next(error);
    }
  }

  async createTimeEntry(req: Request, res: Response, next: NextFunction) {
    try {
      res.status(201).json(await dashboardService.createTimeEntry(req.user!.id, req.body));
    } catch (error) {
      next(error);
    }
  }

  async updateTimeEntry(req: Request, res: Response, next: NextFunction) {
    try {
      res.json(await dashboardService.updateTimeEntry(req.user!.id, req.params.entryId, req.body));
    } catch (error) {
      next(error);
    }
  }

  async deleteTimeEntry(req: Request, res: Response, next: NextFunction) {
    try {
      res.json(await dashboardService.deleteTimeEntry(req.user!.id, req.params.entryId));
    } catch (error) {
      next(error);
    }
  }
}

export const dashboardController = new DashboardController();
