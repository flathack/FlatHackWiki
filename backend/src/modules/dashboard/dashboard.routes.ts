import { Router } from 'express';
import { authenticate } from '../../core/middleware/auth.middleware.js';
import { validate } from '../../core/middleware/validation.middleware.js';
import { dashboardController } from './dashboard.controller.js';
import {
  bookmarkIdParamsSchema,
  createBookmarkSchema,
  createTimeEntrySchema,
  createTimeProjectSchema,
  createWidgetSchema,
  entryIdParamsSchema,
  projectIdParamsSchema,
  startTimerSchema,
  stopTimerSchema,
  updateBookmarkSchema,
  updateCommuteSchema,
  updateTimeEntrySchema,
  updateTimeProjectSchema,
  updateWidgetLayoutSchema,
  updateWidgetSchema,
  widgetIdParamsSchema,
} from './dto/dashboard.dto.js';

const router = Router();

router.use(authenticate);

router.get('/', dashboardController.getDashboard);
router.post('/widgets', validate(createWidgetSchema), dashboardController.createWidget);
router.patch('/widgets/layout', validate(updateWidgetLayoutSchema), dashboardController.updateWidgetLayout);
router.patch('/widgets/:widgetId', validate(updateWidgetSchema), dashboardController.updateWidget);
router.delete('/widgets/:widgetId', validate(widgetIdParamsSchema), dashboardController.deleteWidget);

router.get('/bookmarks', dashboardController.listBookmarks);
router.post('/bookmarks', validate(createBookmarkSchema), dashboardController.createBookmark);
router.patch('/bookmarks/:bookmarkId', validate(updateBookmarkSchema), dashboardController.updateBookmark);
router.delete('/bookmarks/:bookmarkId', validate(bookmarkIdParamsSchema), dashboardController.deleteBookmark);

router.get('/commute', dashboardController.getCommute);
router.get('/weather', dashboardController.getWeather);
router.put('/commute', validate(updateCommuteSchema), dashboardController.upsertCommute);

router.get('/time-tracking', dashboardController.getTimeTracking);
router.post('/time-tracking/projects', validate(createTimeProjectSchema), dashboardController.createTimeProject);
router.patch('/time-tracking/projects/:projectId', validate(updateTimeProjectSchema), dashboardController.updateTimeProject);
router.delete('/time-tracking/projects/:projectId', validate(projectIdParamsSchema), dashboardController.deleteTimeProject);
router.post('/time-tracking/entries/start', validate(startTimerSchema), dashboardController.startTimer);
router.post('/time-tracking/entries', validate(createTimeEntrySchema), dashboardController.createTimeEntry);
router.post('/time-tracking/entries/:entryId/stop', validate(stopTimerSchema), dashboardController.stopTimer);
router.patch('/time-tracking/entries/:entryId', validate(updateTimeEntrySchema), dashboardController.updateTimeEntry);
router.delete('/time-tracking/entries/:entryId', validate(entryIdParamsSchema), dashboardController.deleteTimeEntry);

export default router;
