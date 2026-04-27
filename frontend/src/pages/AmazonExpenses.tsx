import { useEffect, useMemo, useState } from 'react';
import AppHeader from '../components/AppHeader';
import {
  amazonExpensesApi,
  type AmazonExpensesDashboard,
  type AmazonExpensePerson,
  type AmazonOrder,
  type AmazonSettlement,
} from '../api/client';

function formatMoney(value: number, currency = 'EUR') {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency }).format(value || 0);
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('de-DE');
}

function maxChartValue(values: Array<{ total: number }>) {
  return Math.max(1, ...values.map((item) => item.total));
}

export default function AmazonExpensesPage() {
  const [data, setData] = useState<AmazonExpensesDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [personForm, setPersonForm] = useState({ displayName: '', notes: '' });
  const [filters, setFilters] = useState({ assignment: 'all', personId: '', paid: 'all' });
  const [billingDay, setBillingDay] = useState(1);
  const [importBusy, setImportBusy] = useState(false);
  const [manualOrderForm, setManualOrderForm] = useState({
    orderDate: new Date().toISOString().slice(0, 10),
    itemTitle: '',
    totalAmount: '',
    quantity: '1',
    personId: '',
    orderId: '',
    paymentInstrument: '',
  });

  const load = async () => {
    try {
      setLoading(true);
      setError('');
      const { data: next } = await amazonExpensesApi.dashboard({
        assignment: filters.assignment as 'all' | 'assigned' | 'unassigned',
        personId: filters.personId || undefined,
        paid: filters.paid as 'all' | 'paid' | 'unpaid',
      });
      setData(next);
      setBillingDay(next.settings.billingDay);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Amazon-Ausgaben konnten nicht geladen werden');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [filters.assignment, filters.personId, filters.paid]);

  const activePersons = useMemo(
    () => data?.persons.filter((person) => person.isActive) ?? [],
    [data?.persons]
  );

  const handleImport = async (files: FileList | null) => {
    if (!files?.length) return;
    setImportBusy(true);
    setError('');
    setMessage('');
    try {
      const payload = await Promise.all(
        Array.from(files).map(async (file) => ({
          fileName: file.name,
          content: await file.text(),
        }))
      );
      const response = await amazonExpensesApi.importCsv(payload);
      setData(response.data.dashboard);
      const created = response.data.files.reduce((sum, item) => sum + item.createdRows, 0);
      const duplicates = response.data.files.reduce((sum, item) => sum + item.duplicateRows, 0);
      const invalid = response.data.files.reduce((sum, item) => sum + item.invalidRows, 0);
      setMessage(`Import abgeschlossen: ${created} neue Zeilen, ${duplicates} Duplikate, ${invalid} fehlerhafte Zeilen.`);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'CSV-Import fehlgeschlagen');
    } finally {
      setImportBusy(false);
    }
  };

  const createPerson = async () => {
    if (!personForm.displayName.trim()) return;
    await amazonExpensesApi.createPerson({
      displayName: personForm.displayName,
      notes: personForm.notes || null,
    });
    setPersonForm({ displayName: '', notes: '' });
    await load();
  };

  const createManualOrder = async () => {
    const totalAmount = Number.parseFloat(manualOrderForm.totalAmount.replace(',', '.'));
    if (!manualOrderForm.itemTitle.trim() || !Number.isFinite(totalAmount)) {
      setError('Bitte Titel und einen gültigen Betrag für die Bestellung angeben.');
      return;
    }

    try {
      setError('');
      setMessage('');
      await amazonExpensesApi.createOrder({
        orderDate: manualOrderForm.orderDate,
        itemTitle: manualOrderForm.itemTitle,
        totalAmount,
        quantity: Number.parseInt(manualOrderForm.quantity, 10) || 1,
        personId: manualOrderForm.personId || null,
        orderId: manualOrderForm.orderId || null,
        paymentInstrument: manualOrderForm.paymentInstrument || null,
      });
      setManualOrderForm((current) => ({
        ...current,
        itemTitle: '',
        totalAmount: '',
        quantity: '1',
        orderId: '',
        paymentInstrument: '',
      }));
      setMessage('Manuelle Bestellung wurde hinzugefügt.');
      await load();
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Manuelle Bestellung konnte nicht gespeichert werden');
    }
  };

  const assignOrder = async (order: AmazonOrder, personId: string) => {
    await amazonExpensesApi.assignOrder(order.id, personId || null);
    await load();
  };

  const updateBillingDay = async () => {
    await amazonExpensesApi.updateSettings({ billingDay });
    await load();
  };

  const markPaid = async (settlement: AmazonSettlement) => {
    await amazonExpensesApi.markSettlementPaid({
      personId: settlement.personId,
      periodKey: settlement.periodKey,
    });
    await load();
  };

  const maxMonthly = maxChartValue(data?.charts.monthlySpend ?? []);
  const maxPerson = maxChartValue(data?.charts.personSpend ?? []);

  return (
    <div className="dashboard-page-shell amazon-page-shell">
      <AppHeader
        title="Amazon Ausgaben"
        subtitle="Import, Zuordnung, Abrechnung und Einkaufsstatistik."
      />

      <main className="amazon-dashboard">
        {error && <div className="widget-message widget-message-error">{error}</div>}
        {message && <div className="widget-message widget-message-success">{message}</div>}
        {loading && <div className="page-loader">Amazon-Ausgaben werden geladen ...</div>}

        {data && (
          <>
            <section className="amazon-hero">
              <div>
                <span className="dialog-eyebrow">Aktueller Kalendermonat</span>
                <h1>{formatMoney(data.summary.currentMonth.total)}</h1>
                <p>
                  {data.summary.currentMonth.orderCount} Bestellungen, {data.summary.currentMonth.unassignedCount} nicht zugeordnet.
                </p>
              </div>
              <div className="amazon-kpi-grid">
                <div><span>Unzugeordnet</span><strong>{formatMoney(data.summary.currentMonth.unassignedTotal)}</strong></div>
                <div><span>Personen</span><strong>{activePersons.length}</strong></div>
                <div><span>Abrechnungstag</span><strong>{data.settings.billingDay}.</strong></div>
              </div>
            </section>

            <section className="amazon-grid">
              <div className="amazon-panel">
                <div className="amazon-panel-header">
                  <div>
                    <span>CSV Import</span>
                    <h2>Amazon Bestellungen importieren</h2>
                  </div>
                  <label className="btn btn-primary">
                    {importBusy ? 'Import läuft ...' : 'CSV auswählen'}
                    <input type="file" accept=".csv,text/csv" multiple hidden onChange={(event) => handleImport(event.target.files)} />
                  </label>
                </div>
                <div className="amazon-batch-list">
                  {data.batches.map((batch) => (
                    <div key={batch.id} className="amazon-batch-row">
                      <strong>{batch.fileName}</strong>
                      <span>{batch.createdRows} neu, {batch.duplicateRows} Duplikate, {batch.invalidRows} fehlerhaft</span>
                    </div>
                  ))}
                  {data.batches.length === 0 && <div className="widget-message">Noch kein Import vorhanden.</div>}
                </div>
              </div>

              <div className="amazon-panel">
                <div className="amazon-panel-header">
                  <div>
                    <span>Manuell</span>
                    <h2>Bestellung hinzufügen</h2>
                  </div>
                </div>
                <div className="amazon-manual-form">
                  <label>
                    <span>Datum</span>
                    <input
                      className="input"
                      type="date"
                      value={manualOrderForm.orderDate}
                      onChange={(event) => setManualOrderForm((current) => ({ ...current, orderDate: event.target.value }))}
                    />
                  </label>
                  <label className="amazon-manual-title">
                    <span>Titel / Beschreibung</span>
                    <input
                      className="input"
                      value={manualOrderForm.itemTitle}
                      onChange={(event) => setManualOrderForm((current) => ({ ...current, itemTitle: event.target.value }))}
                      placeholder="z. B. HDMI Kabel"
                    />
                  </label>
                  <label>
                    <span>Betrag</span>
                    <input
                      className="input"
                      inputMode="decimal"
                      value={manualOrderForm.totalAmount}
                      onChange={(event) => setManualOrderForm((current) => ({ ...current, totalAmount: event.target.value }))}
                      placeholder="19,99"
                    />
                  </label>
                  <label>
                    <span>Menge</span>
                    <input
                      className="input"
                      type="number"
                      min={1}
                      value={manualOrderForm.quantity}
                      onChange={(event) => setManualOrderForm((current) => ({ ...current, quantity: event.target.value }))}
                    />
                  </label>
                  <label>
                    <span>Person</span>
                    <select
                      className="input"
                      value={manualOrderForm.personId}
                      onChange={(event) => setManualOrderForm((current) => ({ ...current, personId: event.target.value }))}
                    >
                      <option value="">Nicht zugeordnet</option>
                      {data.persons.map((person) => <option key={person.id} value={person.id}>{person.displayName}</option>)}
                    </select>
                  </label>
                  <label>
                    <span>Bestellnummer optional</span>
                    <input
                      className="input"
                      value={manualOrderForm.orderId}
                      onChange={(event) => setManualOrderForm((current) => ({ ...current, orderId: event.target.value }))}
                      placeholder="Amazon oder eigene Nummer"
                    />
                  </label>
                  <label>
                    <span>Zahlungsart optional</span>
                    <input
                      className="input"
                      value={manualOrderForm.paymentInstrument}
                      onChange={(event) => setManualOrderForm((current) => ({ ...current, paymentInstrument: event.target.value }))}
                      placeholder="Kreditkarte, PayPal, ..."
                    />
                  </label>
                </div>
                <div className="widget-toolbar-end">
                  <button className="btn btn-primary" onClick={createManualOrder}>Bestellung hinzufügen</button>
                </div>
              </div>

              <div className="amazon-panel">
                <div className="amazon-panel-header">
                  <div>
                    <span>Personen</span>
                    <h2>Tool-Personen verwalten</h2>
                  </div>
                </div>
                <div className="widget-form-grid">
                  <input className="input" value={personForm.displayName} onChange={(event) => setPersonForm((current) => ({ ...current, displayName: event.target.value }))} placeholder="Name" />
                  <input className="input" value={personForm.notes} onChange={(event) => setPersonForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Notiz" />
                </div>
                <div className="widget-toolbar-end">
                  <button className="btn btn-secondary" onClick={createPerson}>Person anlegen</button>
                </div>
                <div className="amazon-person-list">
                  {data.persons.map((person: AmazonExpensePerson) => (
                    <div key={person.id} className="amazon-person-row">
                      <strong>{person.displayName}</strong>
                      <span>{person.notes || (person.isActive ? 'Aktiv' : 'Inaktiv')}</span>
                      <button
                        className="text-button"
                        onClick={async () => {
                          await amazonExpensesApi.updatePerson(person.id, { isActive: !person.isActive });
                          await load();
                        }}
                      >
                        {person.isActive ? 'Deaktivieren' : 'Aktivieren'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="amazon-grid">
              <div className="amazon-panel">
                <div className="amazon-panel-header">
                  <div>
                    <span>Statistik</span>
                    <h2>Monatliche Ausgaben</h2>
                  </div>
                </div>
                <div className="amazon-chart-bars">
                  {data.charts.monthlySpend.map((item) => (
                    <div key={item.month} className="amazon-chart-row">
                      <span>{item.month}</span>
                      <div><i style={{ width: `${Math.max(5, (item.total / maxMonthly) * 100)}%` }} /></div>
                      <strong>{formatMoney(item.total)}</strong>
                    </div>
                  ))}
                  {data.charts.monthlySpend.length === 0 && <div className="widget-message">Noch keine Statistikdaten.</div>}
                </div>
              </div>
              <div className="amazon-panel">
                <div className="amazon-panel-header">
                  <div>
                    <span>Verteilung</span>
                    <h2>Ausgaben pro Person</h2>
                  </div>
                </div>
                <div className="amazon-chart-bars">
                  {data.charts.personSpend.map((item) => (
                    <div key={item.personId} className="amazon-chart-row">
                      <span>{item.label}</span>
                      <div><i style={{ width: `${Math.max(5, (item.total / maxPerson) * 100)}%` }} /></div>
                      <strong>{formatMoney(item.total)}</strong>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="amazon-panel">
              <div className="amazon-panel-header">
                <div>
                  <span>Bestellungen</span>
                  <h2>Prüfen und zuordnen</h2>
                </div>
                <div className="amazon-filter-row">
                  <select className="input" value={filters.assignment} onChange={(event) => setFilters((current) => ({ ...current, assignment: event.target.value }))}>
                    <option value="all">Alle</option>
                    <option value="unassigned">Nicht zugeordnet</option>
                    <option value="assigned">Zugeordnet</option>
                  </select>
                  <select className="input" value={filters.personId} onChange={(event) => setFilters((current) => ({ ...current, personId: event.target.value }))}>
                    <option value="">Alle Personen</option>
                    {data.persons.map((person) => <option key={person.id} value={person.id}>{person.displayName}</option>)}
                  </select>
                </div>
              </div>
              <div className="amazon-table-wrap">
                <table className="amazon-table">
                  <thead>
                    <tr>
                      <th>Datum</th>
                      <th>Artikel</th>
                      <th>Betrag</th>
                      <th>Person</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.orders.map((order) => (
                      <tr key={order.id}>
                        <td>{formatDate(order.orderDate)}</td>
                        <td>
                          <strong>{order.itemTitle}</strong>
                          <small>{order.orderId || 'Ohne Bestellnummer'} · Menge {order.quantity}</small>
                        </td>
                        <td>{formatMoney(order.totalAmount, order.currency || 'EUR')}</td>
                        <td>
                          <select className="input" value={order.personId || ''} onChange={(event) => assignOrder(order, event.target.value)}>
                            <option value="">Nicht zugeordnet</option>
                            {data.persons.map((person) => <option key={person.id} value={person.id}>{person.displayName}</option>)}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="amazon-panel">
              <div className="amazon-panel-header">
                <div>
                  <span>Abrechnung</span>
                  <h2>Settlements pro Zeitraum und Person</h2>
                </div>
                <div className="amazon-filter-row">
                  <input className="input" type="number" min={1} max={28} value={billingDay} onChange={(event) => setBillingDay(Number(event.target.value) || 1)} />
                  <button className="btn btn-secondary" onClick={updateBillingDay}>Abrechnungstag speichern</button>
                  <select className="input" value={filters.paid} onChange={(event) => setFilters((current) => ({ ...current, paid: event.target.value }))}>
                    <option value="all">Alle Status</option>
                    <option value="unpaid">Offen</option>
                    <option value="paid">Bezahlt</option>
                  </select>
                </div>
              </div>
              <div className="amazon-settlement-list">
                {data.settlements.map((settlement) => (
                  <div key={`${settlement.periodKey}-${settlement.personId}`} className={`amazon-settlement-row ${settlement.paid ? 'paid' : ''}`}>
                    <div>
                      <strong>{settlement.personName}</strong>
                      <span>{settlement.periodLabel} · {settlement.orderCount} Bestellungen</span>
                    </div>
                    <em>{formatMoney(settlement.total)}</em>
                    {settlement.paid ? (
                      <span className="amazon-paid-badge">Bezahlt {settlement.payment?.paidAt ? formatDate(settlement.payment.paidAt) : ''}</span>
                    ) : (
                      <button className="btn btn-primary" onClick={() => markPaid(settlement)}>Als bezahlt markieren</button>
                    )}
                  </div>
                ))}
                {data.settlements.length === 0 && <div className="widget-message">Noch keine abrechenbaren Zuordnungen vorhanden.</div>}
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
