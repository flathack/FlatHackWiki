import { DashboardWidgetType, PrismaClient } from '@prisma/client';
const db = new PrismaClient();
console.log(JSON.stringify({ DashboardWidgetType, hasTelegramModel: typeof db.telegramChatMessage !== 'undefined' }));
