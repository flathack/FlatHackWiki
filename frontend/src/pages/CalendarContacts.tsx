import { useMemo, useState } from 'react';
import { authApi } from '../api/client';
import { useAuthStore } from '../context/auth.store';
import AppHeader from '../components/AppHeader';

const nextcloudUrl = (import.meta.env.VITE_NEXTCLOUD_URL || 'http://localhost:8080').replace(/\/$/, '');

function getDefaultNextcloudUser(email?: string, name?: string) {
  const fromEmail = email?.split('@')[0]?.trim();
  if (fromEmail) return fromEmail.toLowerCase();
  return (name || 'steve').trim().toLowerCase().replace(/\s+/g, '.');
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  return (
    <button type="button" className="btn btn-secondary groupware-copy-button" onClick={copy}>
      {copied ? 'Kopiert' : 'Kopieren'}
    </button>
  );
}

export default function CalendarContacts() {
  const user = useAuthStore((state) => state.user);
  const updateUser = useAuthStore((state) => state.updateUser);
  const [nextcloudUser, setNextcloudUser] = useState(() => user?.nextcloudUsername || getDefaultNextcloudUser(user?.email, user?.name));
  const [nextcloudAppPassword, setNextcloudAppPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const davPrincipalUrl = useMemo(
    () => `${nextcloudUrl}/remote.php/dav/principals/users/${encodeURIComponent(nextcloudUser)}/`,
    [nextcloudUser]
  );
  const calendarUrl = `${nextcloudUrl}/apps/calendar`;
  const contactsUrl = `${nextcloudUrl}/apps/contacts`;
  const appPasswordsUrl = `${nextcloudUrl}/settings/user/security`;

  const saveNextcloudSettings = async () => {
    setSaving(true);
    setMessage('');
    setError('');

    try {
      const normalizedUsername = nextcloudUser.trim() || null;
      const normalizedPassword = nextcloudAppPassword.trim() || null;
      const { data } = await authApi.updateMe({
        nextcloudUsername: normalizedUsername,
        nextcloudAppPassword: normalizedPassword ?? undefined,
      });

      updateUser({
        nextcloudUsername: data.nextcloudUsername,
        hasNextcloudAppPassword: data.hasNextcloudAppPassword,
      });
      if (normalizedUsername) {
        setNextcloudUser(normalizedUsername);
      }
      setNextcloudAppPassword('');
      setMessage('Nextcloud-Zugang gespeichert. Das Kalender-Widget nutzt jetzt dein eigenes App-Passwort.');
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Nextcloud-Zugang konnte nicht gespeichert werden.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="dashboard-page-shell">
      <AppHeader
        subtitle="Kalender, Kontakte und mobile Synchronisation."
        actions={<a className="btn btn-primary" href={nextcloudUrl} target="_blank" rel="noreferrer">Nextcloud</a>}
      />

      <main className="dashboard-main-shell">
        <section className="groupware-hero">
          <div>
            <div className="dashboard-hero-label">Kalender und Kontakte</div>
            <h1 className="dashboard-hero-title">Deine private Groupware-Zentrale</h1>
            <p className="dashboard-hero-copy">
              Nextcloud ist jetzt der zentrale Speicher fuer Kalender und Kontakte. FlathackWiki dient als Portal
              fuer Schnellzugriff, Sync-Daten und spaetere Dashboard-Widgets.
            </p>
          </div>
          <div className="groupware-hero-actions">
            <a className="btn btn-primary" href={calendarUrl} target="_blank" rel="noreferrer">Kalender</a>
            <a className="btn btn-secondary" href={contactsUrl} target="_blank" rel="noreferrer">Kontakte</a>
          </div>
        </section>

        <section className="groupware-grid">
          <article className="dialog-card span-2">
            <div className="profile-section-header">
              <div>
                <span>Schnellzugriff</span>
                <h3>Nextcloud Apps</h3>
              </div>
            </div>
            <div className="groupware-action-grid">
              <a className="profile-widget-row" href={calendarUrl} target="_blank" rel="noreferrer">
                <span><strong>Kalender-App</strong><small>Termine, Familienkalender, Freigaben</small></span>
                <em>Oeffnen</em>
              </a>
              <a className="profile-widget-row" href={contactsUrl} target="_blank" rel="noreferrer">
                <span><strong>Kontakte-App</strong><small>Adressbuecher, Familienkontakte, Import</small></span>
                <em>Oeffnen</em>
              </a>
              <a className="profile-widget-row" href={appPasswordsUrl} target="_blank" rel="noreferrer">
                <span><strong>App-Passwoerter</strong><small>Eigene Passwoerter fuer iPhone, iPad und Android</small></span>
                <em>Erstellen</em>
              </a>
            </div>
          </article>

          <article className="dialog-card">
            <div className="profile-section-header">
              <div>
                <span>Benutzer</span>
                <h3>Sync-Profil</h3>
              </div>
            </div>
            <label className="profile-field">
              <span>Nextcloud-Benutzername</span>
              <input
                className="input"
                value={nextcloudUser}
                onChange={(event) => setNextcloudUser(event.target.value)}
                placeholder="z. B. steve"
              />
            </label>
            <label className="profile-field">
              <span>Nextcloud-App-Passwort</span>
              <input
                className="input"
                type="password"
                value={nextcloudAppPassword}
                onChange={(event) => setNextcloudAppPassword(event.target.value)}
                placeholder={user?.hasNextcloudAppPassword ? 'Neues App-Passwort eingeben, um es zu ersetzen' : 'App-Passwort aus Nextcloud eintragen'}
              />
            </label>
            {error ? <div className="widget-message widget-message-error">{error}</div> : null}
            {message ? <div className="widget-message widget-message-success">{message}</div> : null}
            <div className="widget-toolbar-end">
              <button type="button" className="btn btn-primary" onClick={() => void saveNextcloudSettings()} disabled={saving || !nextcloudUser.trim()}>
                {saving ? 'Speichert ...' : 'Zugang speichern'}
              </button>
            </div>
            <div className="groupware-url-box">
              <span>DAV Serveradresse</span>
              <code>{davPrincipalUrl}</code>
              <CopyButton value={davPrincipalUrl} />
            </div>
          </article>

          <article className="dialog-card">
            <div className="profile-section-header">
              <div>
                <span>Status</span>
                <h3>Lokale Umgebung</h3>
              </div>
            </div>
            <div className="profile-detail-list">
              <div><span>Nextcloud</span><strong>{nextcloudUrl}</strong></div>
              <div><span>Kalender</span><strong>Calendar App installiert</strong></div>
              <div><span>Kontakte</span><strong>Contacts App installiert</strong></div>
              <div><span>Widget-Zugang</span><strong>{user?.hasNextcloudAppPassword ? 'App-Passwort gespeichert' : 'Noch nicht gespeichert'}</strong></div>
              <div><span>Familie</span><strong>Gruppe family vorbereitet</strong></div>
            </div>
          </article>

          <article className="dialog-card">
            <div className="profile-section-header">
              <div>
                <span>iPhone / iPad</span>
                <h3>CalDAV und CardDAV</h3>
              </div>
            </div>
            <ol className="groupware-steps">
              <li>In Nextcloud ein App-Passwort fuer das Geraet erstellen.</li>
              <li>iOS Einstellungen oeffnen: Kalender oder Kontakte, Account hinzufuegen.</li>
              <li>Andere waehlen, dann CalDAV fuer Kalender und CardDAV fuer Kontakte.</li>
              <li>Serveradresse von oben, Benutzername und App-Passwort eintragen.</li>
              <li>Standardkalender und Standardkontakte auf Nextcloud setzen.</li>
            </ol>
          </article>

          <article className="dialog-card">
            <div className="profile-section-header">
              <div>
                <span>Android</span>
                <h3>DAVx5</h3>
              </div>
            </div>
            <ol className="groupware-steps">
              <li>DAVx5 installieren.</li>
              <li>Mit URL und Benutzername verbinden.</li>
              <li>App-Passwort statt Hauptpasswort nutzen.</li>
              <li>Kalender und Kontakte auswaehlen.</li>
              <li>In Kalender-/Kontakte-App Nextcloud als Standardziel pruefen.</li>
            </ol>
          </article>

          <article className="dialog-card span-2">
            <div className="profile-section-header">
              <div>
                <span>Familienbetrieb</span>
                <h3>Naechste Aufgaben</h3>
              </div>
            </div>
            <div className="groupware-check-grid">
              <label className="checkbox-row"><input type="checkbox" defaultChecked readOnly /><span>Kalender erstellt</span></label>
              <label className="checkbox-row"><input type="checkbox" defaultChecked readOnly /><span>Kalender fuer Frau freigegeben</span></label>
              <label className="checkbox-row"><input type="checkbox" readOnly /><span>Familienkontakte anlegen und teilen</span></label>
              <label className="checkbox-row"><input type="checkbox" readOnly /><span>iPhone Sync testen</span></label>
              <label className="checkbox-row"><input type="checkbox" readOnly /><span>Android Sync testen</span></label>
              <label className="checkbox-row"><input type="checkbox" readOnly /><span>NAS Backup aktivieren</span></label>
            </div>
          </article>
        </section>
      </main>
    </div>
  );
}
