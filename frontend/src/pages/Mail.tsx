import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import AppHeader from '../components/AppHeader';
import {
  mailApi,
  type MailAccount,
  type MailboxState,
  type MailMessage,
  type MailMessageDetail,
} from '../api/client';

const defaultSetup = {
  displayName: '',
  email: '',
  username: '',
  password: '',
  imapHost: '',
  imapPort: 993,
  securityMode: 'SSL_TLS' as MailAccount['securityMode'],
};

function formatMailDate(value: string) {
  return new Date(value).toLocaleString('de-DE', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

function senderLabel(message: MailMessage) {
  return message.fromName || message.fromAddress || 'Unbekannter Absender';
}

function inferImapHost(email: string) {
  const domain = email.split('@')[1]?.trim().toLowerCase();
  return domain ? `imap.${domain}` : '';
}

export default function MailPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [mailbox, setMailbox] = useState<MailboxState | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<MailMessageDetail | null>(null);
  const [selectedId, setSelectedId] = useState(searchParams.get('message') || '');
  const [accountId, setAccountId] = useState('');
  const [filter, setFilter] = useState<'all' | 'unread' | 'flagged' | 'attachments'>('all');
  const [query, setQuery] = useState('');
  const [setup, setSetup] = useState(defaultSetup);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [setupBusy, setSetupBusy] = useState(false);
  const [testMessage, setTestMessage] = useState('');
  const [error, setError] = useState('');

  const loadMailbox = async () => {
    try {
      setLoading(true);
      setError('');
      const { data } = await mailApi.mailbox({
        accountId: accountId || undefined,
        q: query || undefined,
        filter,
        limit: 75,
      });
      setMailbox(data);
      if (!selectedId && data.messages[0]) {
        setSelectedId(data.messages[0].id);
      }
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'E-Mails konnten nicht geladen werden.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMailbox();
  }, [accountId, filter]);

  useEffect(() => {
    const handle = window.setTimeout(() => loadMailbox(), 250);
    return () => window.clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    if (!selectedId) {
      setSelectedMessage(null);
      return;
    }

    setSearchParams((current) => {
      current.set('message', selectedId);
      return current;
    });

    mailApi
      .getMessage(selectedId)
      .then(({ data }) => setSelectedMessage(data))
      .catch((err: any) => setError(err.response?.data?.error?.message || 'E-Mail konnte nicht geöffnet werden.'));
  }, [selectedId]);

  const selectedAccount = useMemo(
    () => mailbox?.accounts.find((account) => account.id === accountId) ?? null,
    [accountId, mailbox?.accounts]
  );

  const handleRefresh = async () => {
    try {
      setSyncing(true);
      setError('');
      if (accountId) {
        await mailApi.syncAccount(accountId);
      } else {
        await mailApi.sync();
      }
      await loadMailbox();
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'E-Mail-Aktualisierung fehlgeschlagen.');
    } finally {
      setSyncing(false);
    }
  };

  const handleTest = async () => {
    setSetupBusy(true);
    setTestMessage('');
    setError('');
    try {
      const { data } = await mailApi.testAccount(setup);
      setTestMessage(data.message);
      if (!data.ok) setError(data.message);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Verbindungstest fehlgeschlagen.');
    } finally {
      setSetupBusy(false);
    }
  };

  const handleCreateAccount = async () => {
    setSetupBusy(true);
    setError('');
    setTestMessage('');
    try {
      await mailApi.createAccount({ ...setup, syncNow: true });
      setSetup(defaultSetup);
      setTestMessage('Konto wurde verbunden und der Posteingang wird synchronisiert.');
      await loadMailbox();
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Konto konnte nicht gespeichert werden.');
    } finally {
      setSetupBusy(false);
    }
  };

  const updateSelectedMessage = async (patch: { isRead?: boolean; isFlagged?: boolean }) => {
    if (!selectedMessage) return;
    const { data } = await mailApi.updateMessage(selectedMessage.id, patch);
    setSelectedMessage({ ...selectedMessage, ...data });
    await loadMailbox();
  };

  const showSetup = mailbox?.status === 'setup_required' || !mailbox?.accounts.length;

  return (
    <div className="dashboard-page-shell mail-page-shell">
      <AppHeader title="E-Mail" subtitle="IMAP-Posteingang, tägliche Bearbeitung und persönliche Kontoeinrichtung." />

      <main className="mail-client">
        {error && <div className="widget-message widget-message-error">{error}</div>}
        {testMessage && !error && <div className="widget-message widget-message-success">{testMessage}</div>}

        {showSetup ? (
          <section className="mail-setup-panel">
            <div className="mail-setup-copy">
              <span className="dialog-eyebrow">IMAP Einrichtung</span>
              <h1>E-Mail-Konto verbinden</h1>
              <p>Die Konfiguration ist nur für dein Benutzerkonto sichtbar. Zugangsdaten werden verschlüsselt gespeichert.</p>
            </div>
            <div className="mail-setup-grid">
              <label>
                <span>Anzeigename</span>
                <input className="input" value={setup.displayName} onChange={(event) => setSetup({ ...setup, displayName: event.target.value })} placeholder="Privat, Arbeit, Verein" />
              </label>
              <label>
                <span>E-Mail-Adresse</span>
                <input
                  className="input"
                  type="email"
                  value={setup.email}
                  onChange={(event) => {
                    const email = event.target.value;
                    setSetup((current) => ({
                      ...current,
                      email,
                      username: current.username || email,
                      imapHost: current.imapHost || inferImapHost(email),
                    }));
                  }}
                  placeholder="name@example.com"
                />
              </label>
              <label>
                <span>Benutzername</span>
                <input className="input" value={setup.username} onChange={(event) => setSetup({ ...setup, username: event.target.value })} />
              </label>
              <label>
                <span>Passwort oder App-Passwort</span>
                <input className="input" type="password" value={setup.password} onChange={(event) => setSetup({ ...setup, password: event.target.value })} />
              </label>
              <label>
                <span>IMAP-Server</span>
                <input className="input" value={setup.imapHost} onChange={(event) => setSetup({ ...setup, imapHost: event.target.value })} placeholder="imap.example.com" />
              </label>
              <label>
                <span>Port</span>
                <input className="input" type="number" min={1} max={65535} value={setup.imapPort} onChange={(event) => setSetup({ ...setup, imapPort: Number(event.target.value) })} />
              </label>
              <label>
                <span>Verschlüsselung</span>
                <select className="input" value={setup.securityMode} onChange={(event) => setSetup({ ...setup, securityMode: event.target.value as MailAccount['securityMode'] })}>
                  <option value="SSL_TLS">SSL/TLS</option>
                  <option value="STARTTLS">STARTTLS</option>
                  <option value="NONE">Keine Verschlüsselung</option>
                </select>
              </label>
            </div>
            <div className="mail-setup-actions">
              <button className="btn btn-secondary" onClick={handleTest} disabled={setupBusy}>Verbindung testen</button>
              <button className="btn btn-primary" onClick={handleCreateAccount} disabled={setupBusy}>Konto speichern</button>
            </div>
          </section>
        ) : (
          <section className="mail-layout">
            <aside className="mail-sidebar">
              <button className={`mail-folder-row ${!accountId ? 'mail-folder-row-active' : ''}`} onClick={() => setAccountId('')}>
                <span>Alle Posteingänge</span>
                <strong>{mailbox?.unreadCount ?? 0}</strong>
              </button>
              {mailbox?.accounts.map((account) => (
                <button key={account.id} className={`mail-folder-row ${account.id === accountId ? 'mail-folder-row-active' : ''}`} onClick={() => setAccountId(account.id)}>
                  <span>{account.displayName}</span>
                  <em>{account.status === 'NEEDS_ATTENTION' ? 'Fehler' : account.email}</em>
                </button>
              ))}
            </aside>

            <section className="mail-list-pane">
              <div className="mail-toolbar">
                <input className="input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Suche nach Absender, Betreff oder Vorschau" />
                <select className="input" value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)}>
                  <option value="all">Alle</option>
                  <option value="unread">Ungelesen</option>
                  <option value="flagged">Wichtig</option>
                  <option value="attachments">Mit Anhang</option>
                </select>
                <button className="btn btn-secondary" onClick={handleRefresh} disabled={syncing}>{syncing ? 'Lädt ...' : 'Refresh'}</button>
              </div>
              <div className="mail-list-context">
                <span>{selectedAccount?.displayName || 'Alle Konten'}</span>
                {mailbox?.lastSyncedAt ? <span>Stand {formatMailDate(mailbox.lastSyncedAt)}</span> : null}
              </div>
              <div className="mail-message-list">
                {loading ? <div className="page-loader">E-Mails werden geladen ...</div> : null}
                {mailbox?.messages.map((message) => (
                  <button key={message.id} className={`mail-message-row ${message.id === selectedId ? 'mail-message-row-active' : ''} ${message.isRead ? '' : 'mail-message-row-unread'}`} onClick={() => setSelectedId(message.id)}>
                    <span className="mail-message-sender">{senderLabel(message)}</span>
                    <strong>{message.subject || '(kein Betreff)'}</strong>
                    <span>{message.preview || message.fromAddress}</span>
                    <time>{formatMailDate(message.receivedAt)}</time>
                    <em>{message.hasAttachments ? 'Anhang' : ''}{message.isFlagged ? ' Wichtig' : ''}</em>
                  </button>
                ))}
                {!loading && mailbox?.messages.length === 0 ? <div className="widget-message">Keine E-Mails für diese Auswahl gefunden.</div> : null}
              </div>
            </section>

            <section className="mail-detail-pane">
              {selectedMessage ? (
                <article className="mail-detail">
                  <div className="mail-detail-header">
                    <div>
                      <span className="dialog-eyebrow">{selectedMessage.account.displayName}</span>
                      <h1>{selectedMessage.subject || '(kein Betreff)'}</h1>
                      <p>{selectedMessage.fromName || selectedMessage.fromAddress} · {formatMailDate(selectedMessage.receivedAt)}</p>
                    </div>
                    <div className="mail-detail-actions">
                      <button className="btn btn-secondary" onClick={() => updateSelectedMessage({ isRead: !selectedMessage.isRead })}>{selectedMessage.isRead ? 'Ungelesen' : 'Gelesen'}</button>
                      <button className="btn btn-secondary" onClick={() => updateSelectedMessage({ isFlagged: !selectedMessage.isFlagged })}>{selectedMessage.isFlagged ? 'Nicht wichtig' : 'Wichtig'}</button>
                    </div>
                  </div>
                  <div className="mail-detail-body">
                    {selectedMessage.bodyText || selectedMessage.preview || 'Für diese Nachricht wurden im MVP bisher nur Kopfzeilen synchronisiert. Volltext folgt in der nächsten Ausbaustufe.'}
                  </div>
                </article>
              ) : (
                <div className="mail-detail-empty">Wähle eine E-Mail aus der Liste.</div>
              )}
            </section>
          </section>
        )}
      </main>
    </div>
  );
}
