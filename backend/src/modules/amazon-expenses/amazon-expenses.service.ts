import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { db } from '../../config/database.js';
import { ConflictError, NotFoundError, ValidationError } from '../../core/errors/app.errors.js';

type CsvFileInput = {
  fileName: string;
  content: string;
};

type AmazonFilters = {
  personId?: string;
  assignment?: 'all' | 'assigned' | 'unassigned';
  from?: string;
  to?: string;
  paid?: 'all' | 'paid' | 'unpaid';
};

type ManualAmazonOrderInput = {
  orderDate: string;
  itemTitle: string;
  totalAmount: number;
  quantity?: number;
  personId?: string | null;
  orderId?: string | null;
  currency?: string;
  paymentInstrument?: string | null;
  refundAmount?: number;
  itemAmount?: number;
  invoiceUrl?: string | null;
  orderUrl?: string | null;
};

type NormalizedAmazonOrder = {
  orderId: string | null;
  orderDate: Date;
  itemTitle: string;
  quantity: number;
  itemAmount: number;
  refundAmount: number;
  totalAmount: number;
  currency: string;
  paymentInstrument: string | null;
  shipmentDate: Date | null;
  invoiceUrl: string | null;
  orderUrl: string | null;
  suggestedPersonName: string | null;
  duplicateKey: string;
  rawData: Record<string, string>;
};

const amazonOrderDb: any = (db as any).amazonOrder;
const amazonPersonDb: any = (db as any).amazonExpensePerson;
const amazonBatchDb: any = (db as any).amazonOrderImportBatch;
const amazonSettingsDb: any = (db as any).amazonExpenseSettings;
const amazonSettlementPaymentDb: any = (db as any).amazonSettlementPayment;

function normalizeHeader(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^\uFEFF/, '')
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

function getByAliases(row: Record<string, string>, aliases: string[]) {
  for (const alias of aliases) {
    const key = normalizeHeader(alias);
    const value = row[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }

  return '';
}

function parseCsv(content: string) {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(field);
      field = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(field);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      field = '';
      continue;
    }

    field += char;
  }

  row.push(field);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

function parseDateValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const match = trimmed.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (match) {
    const [, day, month, year] = match;
    const fullYear = year.length === 2 ? `20${year}` : year;
    const date = new Date(Number(fullYear), Number(month) - 1, Number(day));
    if (!Number.isNaN(date.getTime())) return date;
  }

  const isoDate = new Date(trimmed);
  if (!Number.isNaN(isoDate.getTime())) return isoDate;

  return null;
}

function parseMoney(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return 0;
  const isNegative = /^\s*-/.test(trimmed) || /\((.+)\)/.test(trimmed);
  const normalized = trimmed
    .replace(/[^\d,.-]/g, '')
    .replace(/\.(?=\d{3}(?:\D|$))/g, '')
    .replace(',', '.');
  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(Math.abs(parsed) * 100) / 100 * (isNegative ? -1 : 1);
}

function detectCurrency(row: Record<string, string>) {
  const joined = Object.values(row).join(' ');
  const match = joined.match(/\b(EUR|USD|GBP|CHF)\b|[€$£]/i);
  if (!match) return 'EUR';
  if (match[0] === '€') return 'EUR';
  if (match[0] === '$') return 'USD';
  if (match[0] === '£') return 'GBP';
  return match[0].toUpperCase();
}

function hashValue(value: string) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function normalizeAmazonRows(content: string) {
  const rows = parseCsv(content);
  if (rows.length < 2) {
    throw new ValidationError('CSV-Datei enthält keine importierbaren Daten');
  }

  const headers = rows[0].map(normalizeHeader);
  const normalized: NormalizedAmazonOrder[] = [];
  const errors: Array<{ row: number; message: string }> = [];

  rows.slice(1).forEach((values, index) => {
    const rawRow: Record<string, string> = {};
    headers.forEach((header, headerIndex) => {
      rawRow[header] = values[headerIndex]?.trim() ?? '';
    });

    const orderDate =
      parseDateValue(getByAliases(rawRow, ['Order Date', 'Bestelldatum', 'Date', 'Datum'])) ||
      parseDateValue(getByAliases(rawRow, ['Shipment Date', 'Versanddatum']));
    const itemTitle =
      getByAliases(rawRow, ['Title', 'Titel', 'Product Name', 'Item Title', 'Beschreibung', 'Artikel', 'Artikelbezeichnung', 'Description']) ||
      getByAliases(rawRow, ['Name']);
    const orderId = getByAliases(rawRow, ['Order ID', 'Bestellnummer', 'Amazon Order Id', 'Amazon Order ID']) || null;
    const quantity = Math.max(1, Math.round(Number.parseFloat(getByAliases(rawRow, ['Quantity', 'Menge', 'Qty', 'Bestellmenge', 'Artikelmenge'])) || 1));
    const amountValue = getByAliases(rawRow, [
      'Total Charged',
      'Item Total',
      'Item Subtotal',
      'Item Total Amount',
      'Purchase Price Per Unit',
      'Summe inkl. USt',
      'Nettosumme des Artikels',
      'Artikelzwischensumme',
      'Artikelzwischensumme:',
      'Gesamtbetrag der Rechnung',
      'Zahlungsbetrag',
      'Gesamt',
      'Artikel gesamt',
      'Betrag',
      'Total',
      'Amount',
    ]);
    const refundValue = getByAliases(rawRow, ['Refund', 'Refund Amount', 'Erstattung', 'Rueckerstattung', 'Rückerstattung']);
    const totalAmount = parseMoney(amountValue);
    const refundAmount = Math.abs(parseMoney(refundValue));
    const netAmount = Math.round((totalAmount - refundAmount) * 100) / 100;

    if (!orderDate) {
      errors.push({ row: index + 2, message: 'Kein gültiges Bestelldatum gefunden' });
      return;
    }

    if (!itemTitle) {
      errors.push({ row: index + 2, message: 'Kein Artikeltitel/Beschreibung gefunden' });
      return;
    }

    if (Math.abs(netAmount) === 0 && !amountValue) {
      errors.push({ row: index + 2, message: 'Kein Betrag gefunden' });
      return;
    }

    const shipmentDate = parseDateValue(getByAliases(rawRow, ['Shipment Date', 'Versanddatum', 'Ship Date']));
    const paymentInstrument = getByAliases(rawRow, ['Payment Instrument Type', 'Payment Method', 'Zahlungsart', 'Payment']) || null;
    const invoiceUrl = getByAliases(rawRow, ['Invoice URL', 'Invoice Link', 'Rechnung', 'Rechnungslink']) || null;
    const orderUrl = getByAliases(rawRow, ['Order URL', 'Order Link', 'Bestelllink']) || null;
    const suggestedPersonName = getByAliases(rawRow, ['Kontobenutzer', 'Empfängername', 'Account User', 'Buyer', 'Purchased By']) || null;
    const duplicateKey = hashValue(
      [
        orderId ?? '',
        orderDate.toISOString().slice(0, 10),
        itemTitle.toLowerCase().replace(/\s+/g, ' '),
        quantity,
        netAmount.toFixed(2),
      ].join('|')
    );

    normalized.push({
      orderId,
      orderDate,
      itemTitle: itemTitle.slice(0, 2000),
      quantity,
      itemAmount: totalAmount,
      refundAmount,
      totalAmount: netAmount,
      currency: detectCurrency(rawRow),
      paymentInstrument,
      shipmentDate,
      invoiceUrl,
      orderUrl,
      suggestedPersonName,
      duplicateKey,
      rawData: rawRow,
    });
  });

  return { orders: normalized, errors, rowCount: rows.length - 1 };
}

function toNumber(value: unknown) {
  if (typeof value === 'number') return value;
  if (value && typeof (value as any).toNumber === 'function') return (value as any).toNumber();
  return Number(value ?? 0);
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function getPeriodForDate(date: Date, billingDay: number) {
  const safeDay = Math.min(28, Math.max(1, billingDay));
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const candidate = new Date(start.getFullYear(), start.getMonth(), safeDay);
  const periodStart = start >= candidate
    ? candidate
    : new Date(start.getFullYear(), start.getMonth() - 1, safeDay);
  const periodEnd = new Date(periodStart.getFullYear(), periodStart.getMonth() + 1, safeDay);
  periodEnd.setMilliseconds(-1);
  return {
    key: periodStart.toISOString().slice(0, 10),
    start: periodStart,
    end: periodEnd,
    label: `${periodStart.toLocaleDateString('de-DE')} - ${periodEnd.toLocaleDateString('de-DE')}`,
  };
}

function getCalendarMonthRange(date = new Date()) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 1);
  end.setMilliseconds(-1);
  return { start, end };
}

function sanitizeOrder(order: any) {
  return {
    ...order,
    itemAmount: toNumber(order.itemAmount),
    refundAmount: toNumber(order.refundAmount),
    totalAmount: toNumber(order.totalAmount),
  };
}

function sanitizePayment(payment: any | undefined) {
  if (!payment) return null;
  return {
    ...payment,
    amountSnapshot: toNumber(payment.amountSnapshot),
  };
}

class AmazonExpensesService {
  private async getOrCreateSuggestedPerson(userId: string, displayName: string | null) {
    const normalizedName = displayName?.trim();
    if (!normalizedName) return null;

    const persons = await amazonPersonDb.findMany({ where: { userId } });
    const existing = persons.find(
      (person: any) => person.displayName.trim().toLowerCase() === normalizedName.toLowerCase()
    );
    if (existing) return existing.id;

    const created = await amazonPersonDb.create({
      data: {
        userId,
        displayName: normalizedName.slice(0, 255),
        notes: 'Automatisch aus Amazon CSV importiert.',
      },
    });

    return created.id;
  }

  async ensureSettings(userId: string) {
    return amazonSettingsDb.upsert({
      where: { userId },
      create: { userId, billingDay: 1 },
      update: {},
    });
  }

  async updateSettings(userId: string, data: { billingDay: number }) {
    const billingDay = Math.min(28, Math.max(1, Math.round(data.billingDay)));
    return amazonSettingsDb.upsert({
      where: { userId },
      create: { userId, billingDay },
      update: { billingDay },
    });
  }

  async getSummary(userId: string) {
    const { start, end } = getCalendarMonthRange();
    const [orders, persons, unassignedCount, settings] = await Promise.all([
      amazonOrderDb.findMany({
        where: { userId, orderDate: { gte: start, lte: end } },
        include: { person: true },
        orderBy: { orderDate: 'desc' },
      }),
      amazonPersonDb.findMany({ where: { userId, isActive: true }, orderBy: { displayName: 'asc' } }),
      amazonOrderDb.count({ where: { userId, personId: null } }),
      this.ensureSettings(userId),
    ]);

    const total = roundMoney(orders.reduce((sum: number, order: any) => sum + toNumber(order.totalAmount), 0));
    const byPerson = persons.map((person: any) => ({
      personId: person.id,
      displayName: person.displayName,
      total: roundMoney(orders.filter((order: any) => order.personId === person.id).reduce((sum: number, order: any) => sum + toNumber(order.totalAmount), 0)),
    }));

    const unassignedTotal = roundMoney(orders.filter((order: any) => !order.personId).reduce((sum: number, order: any) => sum + toNumber(order.totalAmount), 0));

    return {
      currentMonth: {
        start: start.toISOString(),
        end: end.toISOString(),
        total,
        orderCount: orders.length,
        unassignedCount,
        unassignedTotal,
      },
      byPerson,
      billingDay: settings.billingDay,
    };
  }

  async getDashboard(userId: string, filters: AmazonFilters = {}) {
    const settings = await this.ensureSettings(userId);
    const where: Record<string, unknown> = { userId };
    if (filters.personId) where.personId = filters.personId;
    if (filters.assignment === 'assigned') where.personId = { not: null };
    if (filters.assignment === 'unassigned') where.personId = null;
    if (filters.from || filters.to) {
      where.orderDate = {
        ...(filters.from ? { gte: new Date(filters.from) } : {}),
        ...(filters.to ? { lte: new Date(filters.to) } : {}),
      };
    }

    const [ordersRaw, persons, paymentsRaw, batches, summary] = await Promise.all([
      amazonOrderDb.findMany({
        where,
        include: { person: true },
        orderBy: [{ orderDate: 'desc' }, { createdAt: 'desc' }],
        take: 500,
      }),
      amazonPersonDb.findMany({ where: { userId }, orderBy: [{ isActive: 'desc' }, { displayName: 'asc' }] }),
      amazonSettlementPaymentDb.findMany({ where: { userId }, include: { person: true } }),
      amazonBatchDb.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 10 }),
      this.getSummary(userId),
    ]);

    const orders = ordersRaw.map(sanitizeOrder);
    const payments = paymentsRaw.map(sanitizePayment);
    const totalsByMonth = new Map<string, number>();
    const totalsByPerson = new Map<string, number>();
    const settlements = new Map<string, any>();

    for (const order of orders) {
      const monthKey = order.orderDate.toISOString().slice(0, 7);
      totalsByMonth.set(monthKey, roundMoney((totalsByMonth.get(monthKey) ?? 0) + order.totalAmount));
      const personKey = order.personId ?? 'unassigned';
      totalsByPerson.set(personKey, roundMoney((totalsByPerson.get(personKey) ?? 0) + order.totalAmount));

      if (!order.personId) continue;
      const period = getPeriodForDate(new Date(order.orderDate), settings.billingDay);
      const key = `${period.key}:${order.personId}`;
      const current = settlements.get(key) ?? {
        periodKey: period.key,
        periodStart: period.start.toISOString(),
        periodEnd: period.end.toISOString(),
        periodLabel: period.label,
        personId: order.personId,
        personName: order.person?.displayName ?? 'Unbekannt',
        total: 0,
        orderCount: 0,
        payment: null,
        paid: false,
      };
      current.total = roundMoney(current.total + order.totalAmount);
      current.orderCount += 1;
      settlements.set(key, current);
    }

    for (const settlement of settlements.values()) {
      const payment = payments.find((item: any) => item.personId === settlement.personId && item.periodKey === settlement.periodKey);
      settlement.payment = payment ?? null;
      settlement.paid = Boolean(payment?.paidAt);
    }

    let settlementList = [...settlements.values()].sort((a, b) => b.periodKey.localeCompare(a.periodKey) || a.personName.localeCompare(b.personName, 'de'));
    if (filters.paid === 'paid') settlementList = settlementList.filter((item) => item.paid);
    if (filters.paid === 'unpaid') settlementList = settlementList.filter((item) => !item.paid);

    return {
      settings,
      persons,
      orders,
      batches,
      summary,
      settlements: settlementList,
      charts: {
        monthlySpend: [...totalsByMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, total]) => ({ month, total })),
        personSpend: [...totalsByPerson.entries()].map(([personId, total]) => ({
          personId,
          label: personId === 'unassigned' ? 'Nicht zugeordnet' : persons.find((person: any) => person.id === personId)?.displayName ?? 'Unbekannt',
          total,
        })).sort((a, b) => b.total - a.total),
        paidVsUnpaid: {
          paid: settlementList.filter((item) => item.paid).length,
          unpaid: settlementList.filter((item) => !item.paid).length,
        },
      },
    };
  }

  async importCsv(userId: string, files: CsvFileInput[]) {
    if (!files.length) throw new ValidationError('Bitte mindestens eine CSV-Datei auswählen');
    const summaries = [];

    for (const file of files) {
      const fileHash = hashValue(file.content);
      const existingBatch = await amazonBatchDb.findUnique({
        where: { userId_fileHash: { userId, fileHash } },
      });

      if (existingBatch) {
        summaries.push({
          fileName: file.fileName,
          importedRows: existingBatch.importedRows,
          createdRows: 0,
          duplicateRows: existingBatch.importedRows,
          invalidRows: 0,
          skipped: true,
          errors: [{ message: 'Diese Datei wurde bereits importiert.' }],
        });
        continue;
      }

      const parsed = normalizeAmazonRows(file.content);
      const batch = await amazonBatchDb.create({
        data: {
          userId,
          fileName: file.fileName.slice(0, 255),
          fileHash,
          importedRows: parsed.rowCount,
          createdRows: 0,
          duplicateRows: 0,
          invalidRows: parsed.errors.length,
          errors: parsed.errors as Prisma.InputJsonValue,
        },
      });

      let createdRows = 0;
      let duplicateRows = 0;

      for (const order of parsed.orders) {
        try {
          const personId = await this.getOrCreateSuggestedPerson(userId, order.suggestedPersonName);
          await amazonOrderDb.create({
            data: {
              userId,
              personId,
              importBatchId: batch.id,
              orderId: order.orderId,
              orderDate: order.orderDate,
              itemTitle: order.itemTitle,
              quantity: order.quantity,
              itemAmount: order.itemAmount,
              refundAmount: order.refundAmount,
              totalAmount: order.totalAmount,
              currency: order.currency,
              paymentInstrument: order.paymentInstrument,
              shipmentDate: order.shipmentDate,
              invoiceUrl: order.invoiceUrl,
              orderUrl: order.orderUrl,
              duplicateKey: order.duplicateKey,
              rawData: order.rawData as Prisma.InputJsonValue,
            },
          });
          createdRows += 1;
        } catch (error: any) {
          if (error?.code === 'P2002') {
            duplicateRows += 1;
            continue;
          }
          throw error;
        }
      }

      await amazonBatchDb.update({
        where: { id: batch.id },
        data: { createdRows, duplicateRows },
      });

      summaries.push({
        fileName: file.fileName,
        importedRows: parsed.rowCount,
        createdRows,
        duplicateRows,
        invalidRows: parsed.errors.length,
        skipped: false,
        errors: parsed.errors.slice(0, 25),
      });
    }

    return { files: summaries, dashboard: await this.getDashboard(userId) };
  }

  async createOrder(userId: string, data: ManualAmazonOrderInput) {
    const orderDate = parseDateValue(data.orderDate);
    if (!orderDate) throw new ValidationError('Bitte ein gültiges Bestelldatum angeben');

    if (data.personId) {
      const person = await amazonPersonDb.findFirst({ where: { id: data.personId, userId } });
      if (!person) throw new NotFoundError('Person nicht gefunden');
    }

    const totalAmount = roundMoney(data.totalAmount);
    const refundAmount = roundMoney(Math.abs(data.refundAmount ?? 0));
    const itemAmount = roundMoney(data.itemAmount ?? totalAmount + refundAmount);
    const quantity = Math.max(1, Math.round(data.quantity ?? 1));
    const itemTitle = data.itemTitle.trim();
    const orderNumber = data.orderId?.trim() || null;
    const currency = (data.currency?.trim() || 'EUR').toUpperCase();
    const duplicateKey = hashValue(
      [
        'manual',
        orderNumber ?? '',
        orderDate.toISOString().slice(0, 10),
        itemTitle.toLowerCase().replace(/\s+/g, ' '),
        quantity,
        totalAmount.toFixed(2),
      ].join('|')
    );

    try {
      return sanitizeOrder(await amazonOrderDb.create({
        data: {
          userId,
          personId: data.personId || null,
          orderId: orderNumber,
          orderDate,
          itemTitle: itemTitle.slice(0, 2000),
          quantity,
          itemAmount,
          refundAmount,
          totalAmount,
          currency,
          paymentInstrument: data.paymentInstrument?.trim() || null,
          invoiceUrl: data.invoiceUrl?.trim() || null,
          orderUrl: data.orderUrl?.trim() || null,
          duplicateKey,
          rawData: {
            source: 'manual',
            createdVia: 'flathackwiki',
          } as Prisma.InputJsonValue,
        },
        include: { person: true },
      }));
    } catch (error: any) {
      if (error?.code === 'P2002') {
        throw new ConflictError('Diese Bestellung ist bereits vorhanden.');
      }
      throw error;
    }
  }

  async createPerson(userId: string, data: { displayName: string; notes?: string | null }) {
    return amazonPersonDb.create({
      data: {
        userId,
        displayName: data.displayName.trim(),
        notes: data.notes?.trim() || null,
      },
    });
  }

  async updatePerson(userId: string, personId: string, data: { displayName?: string; notes?: string | null; isActive?: boolean }) {
    const person = await amazonPersonDb.findFirst({ where: { id: personId, userId } });
    if (!person) throw new NotFoundError('Person nicht gefunden');
    return amazonPersonDb.update({
      where: { id: personId },
      data: {
        ...(data.displayName ? { displayName: data.displayName.trim() } : {}),
        ...(data.notes !== undefined ? { notes: data.notes?.trim() || null } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      },
    });
  }

  async deletePerson(userId: string, personId: string) {
    const person = await amazonPersonDb.findFirst({ where: { id: personId, userId } });
    if (!person) throw new NotFoundError('Person nicht gefunden');
    await amazonOrderDb.updateMany({ where: { userId, personId }, data: { personId: null } });
    await amazonPersonDb.delete({ where: { id: personId } });
    return { success: true };
  }

  async assignOrder(userId: string, orderId: string, personId: string | null) {
    const order = await amazonOrderDb.findFirst({ where: { id: orderId, userId } });
    if (!order) throw new NotFoundError('Amazon-Bestellung nicht gefunden');
    if (personId) {
      const person = await amazonPersonDb.findFirst({ where: { id: personId, userId } });
      if (!person) throw new NotFoundError('Person nicht gefunden');
    }

    return sanitizeOrder(await amazonOrderDb.update({
      where: { id: orderId },
      data: { personId },
      include: { person: true },
    }));
  }

  async markSettlementPaid(userId: string, data: { personId: string; periodKey: string; paidNote?: string | null }) {
    const settings = await this.ensureSettings(userId);
    const person = await amazonPersonDb.findFirst({ where: { id: data.personId, userId } });
    if (!person) throw new NotFoundError('Person nicht gefunden');
    const periodStart = new Date(data.periodKey);
    if (Number.isNaN(periodStart.getTime())) throw new ValidationError('Ungültiger Abrechnungszeitraum');
    const period = getPeriodForDate(periodStart, settings.billingDay);

    const orders = await amazonOrderDb.findMany({
      where: { userId, personId: data.personId, orderDate: { gte: period.start, lte: period.end } },
    });
    const amountSnapshot = roundMoney(orders.reduce((sum: number, order: any) => sum + toNumber(order.totalAmount), 0));
    if (amountSnapshot <= 0) throw new ValidationError('Für diesen Zeitraum gibt es keinen offenen Betrag.');

    const existing = await amazonSettlementPaymentDb.findUnique({
      where: { userId_personId_periodKey: { userId, personId: data.personId, periodKey: period.key } },
    });
    if (existing?.paidAt) {
      throw new ConflictError('Diese Abrechnung ist bereits als bezahlt markiert.');
    }

    return sanitizePayment(await amazonSettlementPaymentDb.upsert({
      where: { userId_personId_periodKey: { userId, personId: data.personId, periodKey: period.key } },
      create: {
        userId,
        personId: data.personId,
        periodKey: period.key,
        periodStart: period.start,
        periodEnd: period.end,
        amountSnapshot,
        status: 'PAID',
        paidAt: new Date(),
        paidNote: data.paidNote?.trim() || null,
      },
      update: {
        amountSnapshot,
        status: 'PAID',
        paidAt: new Date(),
        paidNote: data.paidNote?.trim() || null,
      },
    }));
  }
}

export const amazonExpensesService = new AmazonExpensesService();
