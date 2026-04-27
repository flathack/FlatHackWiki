import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
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

function formatFullDate(value?: string | null) {
  if (!value) return 'noch nie';
  return new Date(value).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
}

function formatListDate(value: string) {
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
}

function senderLabel(message: MailMessage) {
  return message.fromName || message.fromAddress || 'Unbekannter Absender';
}

function senderInitials(message: MailMessage) {
  return senderLabel(message).trim().slice(0, 2).toUpperCase();
}

function inferImapHost(email: string) {
  const domain = email.split('@')[1]?.trim().toLowerCase();
  if (domain && imapHostPresets[domain]) return imapHostPresets[domain];
  return domain ? `imap.${domain}` : '';
}

function messageSnippet(message: MailMessage) {
  return message.preview || message.fromAddress || 'Keine Vorschau verfügbar';
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
        if (accountId) await mailApi.syncAccount(accountId);
        else await mailApi.sync();
      }

      const { data } = await mailApi.mailbox({
        accountId: accountId || undefined,
        q: query || undefined,
        filter,
        limit: 100,
      });

      setMailbox(data);
      setLastLoadedAt(new Date().toISOString());

      const selectionStillVisible = selectedId && data.messages.some((message) => message.id === selectedId);
      if (!selectionStillVisible) setSelectedId(data.messages[0]?.id || '');
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
      if (document.visibilityState === 'visible') loadMailbox({ sync: true, showLoading: false });
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

  const showSetup = mailbox?.status === 'setup_required' || !mailbox?.accounts.length;
  const accountCount = mailbox?.accounts.length ?? 0;
  const currentTitle = selectedAccount?.displayName || 'Posteingang';
  const statusText = syncing ? 'Synchronisiert...' : `Aktualisiert ${formatFullDate(mailbox?.lastSyncedAt || lastLoadedAt)}`;

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
      setTestMessage('Konto wurde verbunden und synchronisiert.');
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

  return (
    <div className="mail-webmail-shell">
      <header className="mail-webmail-topbar">
        <Link className="mail-webmail-brand" to="/dashboard">MAIL</Link>
        <div className="mail-webmail-search">
          <span aria-hidden="true">Suchen</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="In E-Mail suchen" />
          <select value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)} aria-label="Filter">
            <option value="all">Alle</option>
            <option value="unread">Ungelesen</option>
            <option value="flagged">Wichtig</option>
            <option value="attachments">Mit Anhang</option>
          </select>
        </div>
        <div className="mail-webmail-top-actions">
          <button type="button" onClick={() => setAutoRefresh((current) => !current)}>{autoRefresh ? 'Auto an' : 'Auto aus'}</button>
          <button type="button" onClick={handleRefresh} disabled={syncing}>{syncing ? 'Sync...' : 'Sync'}</button>
        </div>
      </header>

      <main className="mail-webmail-main">
        <aside className="mail-webmail-sidebar">
          <button className="mail-compose-button" type="button" onClick={() => setAccountFormOpen(true)}>Konto verbinden</button>

          <div className="mail-folder-group">
            <span className="mail-folder-group-title">Konten</span>
            <button className={`mail-nav-row ${!accountId ? 'active' : ''}`} onClick={() => setAccountId('')}>
              <span>Posteingang</span>
              <strong>{mailbox?.unreadCount ?? 0}</strong>
            </button>
            {mailbox?.accounts.map((account) => (
              <div key={account.id} className="mail-account-nav">
                <button className={`mail-nav-row ${account.id === accountId ? 'active' : ''}`} onClick={() => setAccountId(account.id)}>
                  <span>{account.displayName}</span>
                  <strong>{account.status === 'NEEDS_ATTENTION' ? '!' : ''}</strong>
                </button>
                <small>{account.email}</small>
                {account.lastError ? <em>{account.lastError}</em> : null}
              </div>
            ))}
          </div>

          <div className="mail-folder-group">
            <span className="mail-folder-group-title">Ansichten</span>
            <button className={`mail-nav-row ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}><span>Alle Nachrichten</span></button>
            <button className={`mail-nav-row ${filter === 'unread' ? 'active' : ''}`} onClick={() => setFilter('unread')}><span>Ungelesen</span></button>
            <button className={`mail-nav-row ${filter === 'flagged' ? 'active' : ''}`} onClick={() => setFilter('flagged')}><span>Wichtig</span></button>
            <button className={`mail-nav-row ${filter === 'attachments' ? 'active' : ''}`} onClick={() => setFilter('attachments')}><span>Mit Anhang</span></button>
          </div>

          <div className="mail-sidebar-footer">
            <span>{accountCount} Konto{accountCount === 1 ? '' : 'en'}</span>
            <span>{statusText}</span>
          </div>
        </aside>

        <section className="mail-webmail-list-pane">
          <div className="mail-list-heading">
            <div>
              <h1>{currentTitle}</h1>
              <span>{mailbox?.total ?? 0} Nachrichten</span>
            </div>
            <button type="button" onClick={handleRefresh} disabled={syncing}>{syncing ? 'Lädt' : 'Aktualisieren'}</button>
          </div>

          {error ? <div className="mail-webmail-alert error">{error}</div> : null}
          {testMessage && !error ? <div className="mail-webmail-alert success">{testMessage}</div> : null}

          {(showSetup || accountFormOpen) ? (
            <section className="mail-setup-drawer">
              <div>
                <span>IMAP</span>
                <h2>{showSetup ? 'E-Mail-Konto verbinden' : 'Weiteres Konto verbinden'}</h2>
              </div>
              <div className="mail-setup-form-grid">
                <label><span>Anzeigename</span><input value={setup.displayName} onChange={(event) => setSetup({ ...setup, displayName: event.target.value })} placeholder="Privat, Arbeit, Verein" /></label>
                <label>
                  <span>E-Mail-Adresse</span>
                  <input
                    type="email"
                    value={setup.email}
                    onChange={(event) => {
                      const email = event.target.value;
                      setSetup((current) => ({ ...current, email, username: current.username || email, imapHost: current.imapHost || inferImapHost(email) }));
                    }}
                    placeholder="name@example.com"
                  />
                </label>
                <label><span>Benutzername</span><input value={setup.username} onChange={(event) => setSetup({ ...setup, username: event.target.value })} /></label>
                <label><span>Passwort oder App-Passwort</span><input type="password" value={setup.password} onChange={(event) => setSetup({ ...setup, password: event.target.value })} /></label>
                <label><span>IMAP-Server</span><input value={setup.imapHost} onChange={(event) => setSetup({ ...setup, imapHost: event.target.value })} placeholder="imap.example.com" /></label>
                <label><span>Port</span><input type="number" min={1} max={65535} value={setup.imapPort} onChange={(event) => setSetup({ ...setup, imapPort: Number(event.target.value) })} /></label>
                <label>
                  <span>Verschlüsselung</span>
                  <select value={setup.securityMode} onChange={(event) => setSetup({ ...setup, securityMode: event.target.value as MailAccount['securityMode'] })}>
                    <option value="SSL_TLS">SSL/TLS</option>
                    <option value="STARTTLS">STARTTLS</option>
                    <option value="NONE">Keine Verschlüsselung</option>
                  </select>
                </label>
              </div>
              <div className="mail-setup-actions-row">
                <button type="button" onClick={handleTest} disabled={setupBusy}>Testen</button>
                <button type="button" onClick={handleCreateAccount} disabled={setupBusy}>Speichern</button>
                {!showSetup ? <button type="button" onClick={() => setAccountFormOpen(false)}>Schließen</button> : null}
              </div>
            </section>
          ) : null}

          <div className="mail-message-table" aria-busy={loading || syncing}>
            {loading ? <div className="mail-list-empty">E-Mails werden geladen...</div> : null}
            {!loading && mailbox?.messages.length === 0 ? <div className="mail-list-empty">Keine E-Mails für diese Auswahl gefunden.</div> : null}
            {mailbox?.messages.map((message) => (
              <button
                key={message.id}
                type="button"
                className={`mail-table-row ${message.id === selectedId ? 'active' : ''} ${message.isRead ? '' : 'unread'}`}
                onClick={() => setSelectedId(message.id)}
              >
                <span className="mail-row-unread-dot" />
                <span className="mail-row-avatar">{senderInitials(message)}</span>
                <span className="mail-row-sender">{senderLabel(message)}</span>
                <span className="mail-row-subject">{message.subject || '(kein Betreff)'}</span>
                <span className="mail-row-preview">{messageSnippet(message)}</span>
                <span className="mail-row-flags">{message.hasAttachments ? 'Anhang' : ''}{message.isFlagged ? ' Wichtig' : ''}</span>
                <time>{formatListDate(message.receivedAt)}</time>
              </button>
            ))}
          </div>
        </section>

        <section className="mail-webmail-reader">
          {messageLoading ? <div className="mail-reader-empty">E-Mail wird geöffnet...</div> : null}
          {!messageLoading && selectedMessage ? (
            <article className="mail-reader-card">
              <div className="mail-reader-toolbar">
                <button type="button" onClick={() => updateSelectedMessage({ isRead: !selectedMessage.isRead })}>{selectedMessage.isRead ? 'Ungelesen' : 'Gelesen'}</button>
                <button type="button" onClick={() => updateSelectedMessage({ isFlagged: !selectedMessage.isFlagged })}>{selectedMessage.isFlagged ? 'Markierung entfernen' : 'Wichtig'}</button>
                <button type="button" onClick={() => selectedMessage.account && deleteAccount(selectedMessage.account)}>Konto entfernen</button>
              </div>
              <header className="mail-reader-header">
                <span>{selectedMessage.account.displayName}</span>
                <h2>{selectedMessage.subject || '(kein Betreff)'}</h2>
                <p>{selectedMessage.fromName || selectedMessage.fromAddress} · {formatFullDate(selectedMessage.receivedAt)}</p>
              </header>
              <div className="mail-reader-meta">
                <span>Von: {selectedMessage.fromAddress}</span>
                <span>Ordner: {selectedMessage.folder.displayName}</span>
                {selectedMessage.hasAttachments ? <span>Anhang vorhanden</span> : null}
              </div>
              <div className="mail-reader-body">
                {selectedMessage.bodyText || selectedMessage.preview || 'Für diese Nachricht konnte kein lesbarer Text synchronisiert werden.'}
              </div>
            </article>
          ) : null}
          {!messageLoading && !selectedMessage ? <div className="mail-reader-empty">Wähle eine E-Mail aus der Liste.</div> : null}
        </section>
      </main>
    </div>
  );
}