import { Router } from 'express';
import { authenticate } from '../../core/middleware/auth.middleware.js';
import { validate } from '../../core/middleware/validation.middleware.js';
import { amazonExpensesController } from './amazon-expenses.controller.js';
import {
  amazonDashboardQuerySchema,
  amazonPersonParamsSchema,
  assignAmazonOrderSchema,
  createAmazonOrderSchema,
  createAmazonPersonSchema,
  importAmazonCsvSchema,
  markAmazonSettlementPaidSchema,
  updateAmazonPersonSchema,
  updateAmazonSettingsSchema,
} from './dto/amazon-expenses.dto.js';

const router = Router();

router.use(authenticate);

router.get('/', validate(amazonDashboardQuerySchema), amazonExpensesController.getDashboard);
router.get('/summary', amazonExpensesController.getSummary);
router.post('/import', validate(importAmazonCsvSchema), amazonExpensesController.importCsv);
router.post('/persons', validate(createAmazonPersonSchema), amazonExpensesController.createPerson);
router.patch('/persons/:personId', validate(updateAmazonPersonSchema), amazonExpensesController.updatePerson);
router.delete('/persons/:personId', validate(amazonPersonParamsSchema), amazonExpensesController.deletePerson);
router.post('/orders', validate(createAmazonOrderSchema), amazonExpensesController.createOrder);
router.patch('/orders/:orderId/assignment', validate(assignAmazonOrderSchema), amazonExpensesController.assignOrder);
router.patch('/settings', validate(updateAmazonSettingsSchema), amazonExpensesController.updateSettings);
router.post('/settlements/mark-paid', validate(markAmazonSettlementPaidSchema), amazonExpensesController.markSettlementPaid);

export default router;
