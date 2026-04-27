import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import AppHeader from '../components/AppHeader';
import {
  mailApi,
  type MailAccount,
  type MailboxState,
  type MailMessage,
  type MailMessageDetail,
} from '../api/client';

const autoRefreshIntervalMs = 60 * 1000;

const defaultSetup = {
  displayName: '',
  email: '',
  username: '',
  password: '',
  imapHost: '',
  imapPort: 993,
  securityMode: 'SSL_TLS' as MailAccount['securityMode'],
};

const imapHostPresets: Record<string, string> = {
  'stevenschoedel.de': 'imap.ionos.de',
  'ionos.de': 'imap.ionos.de',
  'ionos.com': 'imap.ionos.de',
  '1und1.de': 'imap.1und1.de',
  'gmail.com': 'imap.gmail.com',
  'googlemail.com': 'imap.gmail.com',
  'outlook.com': 'outlook.office365.com',
  'hotmail.com': 'outlook.office365.com',
  'live.com': 'outlook.office365.com',
  'icloud.com': 'imap.mail.me.com',
  'me.com': 'imap.mail.me.com',
};

function formatMailDate(value?: string | null) {
  if (!value) return 'noch nie';
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
  if (domain && imapHostPresets[domain]) return imapHostPresets[domain];
  return domain ? `imap.${domain}` : '';
}

function messageSnippet(message: MailMessage) {
  return message.preview || message.fromAddress || 'Keine Vorschau verfuegbar';
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
  const [accountFormOpen, setAccountFormOpen] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [loading, setLoading] = useState(true);
  const [messageLoading, setMessageLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [setupBusy, setSetupBusy] = useState(false);
  const [testMessage, setTestMessage] = useState('');
  const [error, setError] = useState('');
  const [lastLoadedAt, setLastLoadedAt] = useState<string | null>(null);
  const refreshInFlight = useRef(false);

  const loadMailbox = useCallback(async (options: { sync?: boolean; showLoading?: boolean } = {}) => {
    if (refreshInFlight.current) return;

    const shouldSync = options.sync === true;
    const showLoading = options.showLoading !== false;
    refreshInFlight.current = true;

    try {
      if (showLoading) setLoading(true);
      if (shouldSync) setSyncing(true);
      setError('');

      if (shouldSync) {
        if (accountId) {
          await mailApi.syncAccount(accountId);
        } else {
          await mailApi.sync();
        }
      }

      const { data } = await mailApi.mailbox({
        accountId: accountId || undefined,
        q: query || undefined,
        filter,
        limit: 100,
      });

      setMailbox(data);
      setLastLoadedAt(new Date().toISOString());

      const currentSelectionStillVisible = selectedId && data.messages.some((message) => message.id === selectedId);
      if (!currentSelectionStillVisible) {
        setSelectedId(data.messages[0]?.id || '');
      }
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'E-Mails konnten nicht geladen werden.');
    } finally {
      refreshInFlight.current = false;
      if (showLoading) setLoading(false);
      if (shouldSync) setSyncing(false);
    }
  }, [accountId, filter, query, selectedId]);

  useEffect(() => {
    loadMailbox({ showLoading: true });
  }, [accountId, filter, loadMailbox]);

  useEffect(() => {
    const handle = window.setTimeout(() => loadMailbox({ showLoading: false }), 300);
    return () => window.clearTimeout(handle);
  }, [loadMailbox, query]);

  useEffect(() => {
    if (!autoRefresh || mailbox?.status === 'setup_required') return;

    const refresh = () => {
      if (document.visibilityState === 'visible') {
        loadMailbox({ sync: true, showLoading: false });
      }
    };

    const timer = window.setInterval(refresh, autoRefreshIntervalMs);
    window.addEventListener('focus', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
    };
  }, [autoRefresh, loadMailbox, mailbox?.status]);

  useEffect(() => {
    if (!selectedId) {
      setSelectedMessage(null);
      setSearchParams((current) => {
        current.delete('message');
        return current;
      });
      return;
    }

    let active = true;
    setSearchParams((current) => {
      current.set('message', selectedId);
      return current;
    });
    setMessageLoading(true);

    mailApi
      .getMessage(selectedId)
      .then(async ({ data }) => {
        if (!active) return;
        setSelectedMessage(data);
        if (!data.isRead) {
          await mailApi.updateMessage(data.id, { isRead: true });
          if (active) {
            setSelectedMessage({ ...data, isRead: true });
            await loadMailbox({ showLoading: false });
          }
        }
      })
      .catch((err: any) => {
        if (active) setError(err.response?.data?.error?.message || 'E-Mail konnte nicht geöffnet werden.');
      })
      .finally(() => {
        if (active) setMessageLoading(false);
      });

    return () => {
      active = false;
    };
  }, [loadMailbox, selectedId, setSearchParams]);

  const selectedAccount = useMemo(
    () => mailbox?.accounts.find((account) => account.id === accountId) ?? null,
    [accountId, mailbox?.accounts]
  );

  const activeFolder = useMemo(() => {
    if (!accountId) return null;
    return mailbox?.folders.find((folder) => folder.accountId === accountId && folder.path === 'INBOX') ?? null;
  }, [accountId, mailbox?.folders]);

  const handleRefresh = () => loadMailbox({ sync: true, showLoading: false });

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
      setAccountFormOpen(false);
      setTestMessage('Konto wurde verbunden und der Posteingang wird synchronisiert.');
      await loadMailbox({ sync: true, showLoading: true });
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Konto konnte nicht gespeichert werden.');
    } finally {
      setSetupBusy(false);
    }
  };

  const updateSelectedMessage = async (patch: { isRead?: boolean; isFlagged?: boolean }) => {
    if (!selectedMessage) return;
    try {
      const { data } = await mailApi.updateMessage(selectedMessage.id, patch);
      setSelectedMessage({ ...selectedMessage, ...data });
      await loadMailbox({ showLoading: false });
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'E-Mail konnte nicht aktualisiert werden.');
    }
  };

  const deleteAccount = async (account: MailAccount) => {
    const confirmed = window.confirm(`Mailkonto ${account.displayName} wirklich entfernen? Lokale E-Mail-Kopien werden gelöscht.`);
    if (!confirmed) return;

    try {
      await mailApi.deleteAccount(account.id);
      if (account.id === accountId) setAccountId('');
      await loadMailbox({ showLoading: true });
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Mailkonto konnte nicht entfernt werden.');
    }
  };

  const showSetup = mailbox?.status === 'setup_required' || !mailbox?.accounts.length;
  const accountCount = mailbox?.accounts.length ?? 0;

  return (
    <div className="dashboard-page-shell mail-page-shell">
      <AppHeader title="E-Mail" subtitle="IMAP-Posteingang mit Auto-Sync, Suche, Markierungen und persönlicher Kontoeinrichtung." />

      <main className="mail-client">
        <section className="mail-client-statusbar">
          <div><strong>{mailbox?.unreadCount ?? 0}</strong><span>ungelesen</span></div>
          <div><strong>{mailbox?.total ?? 0}</strong><span>Nachrichten</span></div>
          <div><strong>{accountCount}</strong><span>Konto{accountCount === 1 ? '' : 'en'}</span></div>
          <div className="mail-client-sync-state">
            <span>{syncing ? 'Synchronisiert gerade ...' : `Stand ${formatMailDate(mailbox?.lastSyncedAt || lastLoadedAt)}`}</span>
            <button className="btn btn-secondary" onClick={() => setAutoRefresh((current) => !current)}>Auto {autoRefresh ? 'an' : 'aus'}</button>
            <button className="btn btn-primary" onClick={handleRefresh} disabled={syncing}>{syncing ? 'Lädt ...' : 'Jetzt synchronisieren'}</button>
            {!showSetup ? <button className="btn btn-secondary" onClick={() => setAccountFormOpen((current) => !current)}>Konto hinzufügen</button> : null}
          </div>
        </section>

        {error && <div className="widget-message widget-message-error">{error}</div>}
        {testMessage && !error && <div className="widget-message widget-message-success">{testMessage}</div>}

        {(showSetup || accountFormOpen) ? (
          <section className="mail-setup-panel">
            <div className="mail-setup-copy">
              <span className="dialog-eyebrow">IMAP Einrichtung</span>
              <h1>{showSetup ? 'E-Mail-Konto verbinden' : 'Weiteres Konto verbinden'}</h1>
              <p>Die Konfiguration ist nur für dein Benutzerkonto sichtbar. Zugangsdaten werden verschlüsselt gespeichert.</p>
            </div>
            <div className="mail-setup-grid">
              <label><span>Anzeigename</span><input className="input" value={setup.displayName} onChange={(event) => setSetup({ ...setup, displayName: event.target.value })} placeholder="Privat, Arbeit, Verein" /></label>
              <label>
                <span>E-Mail-Adresse</span>
                <input
                  className="input"
                  type="email"
                  value={setup.email}
                  onChange={(event) => {
                    const email = event.target.value;
                    setSetup((current) => ({ ...current, email, username: current.username || email, imapHost: current.imapHost || inferImapHost(email) }));
                  }}
                  placeholder="name@example.com"
                />
              </label>
              <label><span>Benutzername</span><input className="input" value={setup.username} onChange={(event) => setSetup({ ...setup, username: event.target.value })} /></label>
              <label><span>Passwort oder App-Passwort</span><input className="input" type="password" value={setup.password} onChange={(event) => setSetup({ ...setup, password: event.target.value })} /></label>
              <label><span>IMAP-Server</span><input className="input" value={setup.imapHost} onChange={(event) => setSetup({ ...setup, imapHost: event.target.value })} placeholder="imap.example.com" /></label>
              <label><span>Port</span><input className="input" type="number" min={1} max={65535} value={setup.imapPort} onChange={(event) => setSetup({ ...setup, imapPort: Number(event.target.value) })} /></label>
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
              {!showSetup ? <button className="btn btn-secondary" onClick={() => setAccountFormOpen(false)}>Schließen</button> : null}
            </div>
          </section>
        ) : null}

        {!showSetup ? (
          <section className="mail-layout">
            <aside className="mail-sidebar">
              <button className={`mail-folder-row ${!accountId ? 'mail-folder-row-active' : ''}`} onClick={() => setAccountId('')}>
                <span>Alle Posteingänge</span>
                <strong>{mailbox?.unreadCount ?? 0} ungelesen</strong>
                <em>{mailbox?.messages.length ?? 0} geladen</em>
              </button>
              {mailbox?.accounts.map((account) => (
                <div key={account.id} className={`mail-account-card ${account.id === accountId ? 'mail-folder-row-active' : ''}`}>
                  <button className="mail-account-main" onClick={() => setAccountId(account.id)}>
                    <span>{account.displayName}</span>
                    <strong>{account.status === 'NEEDS_ATTENTION' ? 'Fehler' : account.email}</strong>
                    <em>Sync {formatMailDate(account.lastSyncAt)}</em>
                  </button>
                  {account.lastError ? <p>{account.lastError}</p> : null}
                  <div className="mail-account-actions">
                    <button className="btn btn-secondary" onClick={() => { setAccountId(account.id); loadMailbox({ sync: true, showLoading: false }); }} disabled={syncing}>Sync</button>
                    <button className="btn btn-secondary" onClick={() => deleteAccount(account)}>Entfernen</button>
                  </div>
                </div>
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
              </div>
              <div className="mail-list-context">
                <span>{selectedAccount?.displayName || 'Alle Konten'}</span>
                <span>{activeFolder ? `${activeFolder.unreadCount} ungelesen / ${activeFolder.totalCount} total` : `${mailbox?.total ?? 0} Nachrichten`}</span>
              </div>
              <div className="mail-message-list">
                {loading ? <div className="page-loader">E-Mails werden geladen ...</div> : null}
                {mailbox?.messages.map((message) => (
                  <button key={message.id} className={`mail-message-row ${message.id === selectedId ? 'mail-message-row-active' : ''} ${message.isRead ? '' : 'mail-message-row-unread'}`} onClick={() => setSelectedId(message.id)}>
                    <span className="mail-message-sender">{senderLabel(message)}</span>
                    <strong>{message.subject || '(kein Betreff)'}</strong>
                    <span>{messageSnippet(message)}</span>
                    <time>{formatMailDate(message.receivedAt)}</time>
                    <em>{message.hasAttachments ? 'Anhang' : ''}{message.isFlagged ? ' Wichtig' : ''}</em>
                  </button>
                ))}
                {!loading && mailbox?.messages.length === 0 ? <div className="widget-message">Keine E-Mails für diese Auswahl gefunden.</div> : null}
              </div>
            </section>

            <section className="mail-detail-pane">
              {messageLoading ? <div className="mail-detail-empty">E-Mail wird geöffnet ...</div> : null}
              {!messageLoading && selectedMessage ? (
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
                      <Link className="btn btn-primary" to="/dashboard">Zur Hauptseite</Link>
                    </div>
                  </div>
                  <div className="mail-detail-meta">
                    <span>Von: {selectedMessage.fromAddress}</span>
                    <span>Ordner: {selectedMessage.folder.displayName}</span>
                    {selectedMessage.hasAttachments ? <span>Anhänge vorhanden</span> : null}
                  </div>
                  <div className="mail-detail-body">
                    {selectedMessage.bodyText || selectedMessage.preview || 'Für diese Nachricht konnte kein lesbarer Text synchronisiert werden.'}
                  </div>
                </article>
              ) : null}
              {!messageLoading && !selectedMessage ? <div className="mail-detail-empty">Wähle eine E-Mail aus der Liste.</div> : null}
            </section>
          </section>
        ) : null}
      </main>
    </div>
  );
}