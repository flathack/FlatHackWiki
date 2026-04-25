import { useEffect, useMemo, useState } from 'react';
import { adminApi, type AdminAuditEntry, type AdminStats, type AdminUser } from '../api/client';
import AppHeader from '../components/AppHeader';
import { useAuthStore } from '../context/auth.store';

const roles = ['SUPER_ADMIN', 'SYSTEM_ADMIN', 'SPACE_ADMIN', 'EDITOR', 'AUTHOR', 'COMMENTER', 'VIEWER', 'GUEST', 'USER'];
const statuses: AdminUser['status'][] = ['ACTIVE', 'INACTIVE', 'DELETED'];

function formatDate(value: string) {
  return new Date(value).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
}

export default function AdminPage() {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'audit' | 'system'>('overview');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [auditLogs, setAuditLogs] = useState<AdminAuditEntry[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const isAdmin = user?.globalRole === 'SUPER_ADMIN' || user?.globalRole === 'SYSTEM_ADMIN';
  const activeUsers = useMemo(() => users.filter((item) => item.status === 'ACTIVE'), [users]);

  const loadData = async () => {
    setError('');
    setLoading(true);
    try {
      const [statsResponse, usersResponse, auditResponse] = await Promise.all([
        adminApi.stats(),
        adminApi.users(),
        adminApi.auditLog({ limit: 100 }),
      ]);
      setStats(statsResponse.data);
      setUsers(usersResponse.data);
      setAuditLogs(auditResponse.data);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Admin-Daten konnten nicht geladen werden');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) void loadData();
    else setLoading(false);
  }, [isAdmin]);

  const updateUser = async (targetUser: AdminUser, data: { name?: string; status?: AdminUser['status']; globalRole?: string | null }) => {
    setBusyAction(`${targetUser.id}-update`);
    setError('');
    setMessage('');
    try {
      const { data: updated } = await adminApi.updateUser(targetUser.id, data);
      setUsers((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setMessage(`Benutzer ${updated.email} wurde aktualisiert.`);
      const statsResponse = await adminApi.stats();
      setStats(statsResponse.data);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Benutzer konnte nicht aktualisiert werden');
    } finally {
      setBusyAction('');
    }
  };

  const revokeSessions = async (targetUser: AdminUser) => {
    setBusyAction(`${targetUser.id}-sessions`);
    setError('');
    setMessage('');
    try {
      const { data } = await adminApi.revokeSessions(targetUser.id);
      setMessage(`${data.revoked} Session(s) fuer ${targetUser.email} widerrufen.`);
      const statsResponse = await adminApi.stats();
      setStats(statsResponse.data);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Sessions konnten nicht widerrufen werden');
    } finally {
      setBusyAction('');
    }
  };

  const deleteUser = async (targetUser: AdminUser) => {
    if (!window.confirm(`Benutzer ${targetUser.email} wirklich als gelöscht markieren?`)) return;
    setBusyAction(`${targetUser.id}-delete`);
    setError('');
    setMessage('');
    try {
      await adminApi.deleteUser(targetUser.id);
      await loadData();
      setMessage(`Benutzer ${targetUser.email} wurde als geloescht markiert.`);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Benutzer konnte nicht geloescht werden');
    } finally {
      setBusyAction('');
    }
  };

  if (!isAdmin) {
    return (
      <div className="dashboard-page-shell">
        <AppHeader subtitle="Administration" />
        <main className="page-loader">
          <div className="widget-message widget-message-error">Zugriff verweigert. Administratorrechte erforderlich.</div>
        </main>
      </div>
    );
  }

  return (
    <div className="dashboard-page-shell">
      <AppHeader subtitle="Administration, Benutzer, Audit und Systemstatus." />

      <main className="dashboard-main-shell">
        <section className="admin-hero">
          <div>
            <div className="dashboard-hero-label">Administration</div>
            <h1 className="dashboard-hero-title">Systemverwaltung</h1>
            <p className="dashboard-hero-copy">Benutzer verwalten, Rollen setzen, Sessions widerrufen und Audit-Ereignisse pruefen.</p>
          </div>
          <button className="btn btn-primary" onClick={() => void loadData()} disabled={loading}>
            {loading ? 'Laedt ...' : 'Aktualisieren'}
          </button>
        </section>

        {error && <div className="widget-message widget-message-error">{error}</div>}
        {message && <div className="widget-message widget-message-success">{message}</div>}

        <div className="admin-tabs">
          {[
            ['overview', 'Uebersicht'],
            ['users', 'Benutzer'],
            ['audit', 'Audit'],
            ['system', 'System'],
          ].map(([value, label]) => (
            <button key={value} className={`admin-tab ${activeTab === value ? 'active' : ''}`} onClick={() => setActiveTab(value as typeof activeTab)}>
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="page-loader">Admin-Daten werden geladen ...</div>
        ) : activeTab === 'overview' ? (
          <section className="groupware-grid">
            <article className="dialog-card span-2">
              <div className="widget-stat-grid">
                <div className="widget-stat-box"><span>Benutzer</span><strong>{stats?.userCount ?? 0}</strong></div>
                <div className="widget-stat-box"><span>Aktiv</span><strong>{stats?.activeUserCount ?? activeUsers.length}</strong></div>
                <div className="widget-stat-box"><span>Bereiche</span><strong>{stats?.spaceCount ?? 0}</strong></div>
                <div className="widget-stat-box"><span>Seiten</span><strong>{stats?.pageCount ?? 0}</strong></div>
                <div className="widget-stat-box"><span>Kommentare</span><strong>{stats?.commentCount ?? 0}</strong></div>
                <div className="widget-stat-box"><span>Sessions</span><strong>{stats?.sessionCount ?? 0}</strong></div>
              </div>
            </article>
            <article className="dialog-card">
              <h3>Letzte Audit-Ereignisse</h3>
              <div className="admin-activity-list">
                {auditLogs.slice(0, 6).map((entry) => (
                  <div key={entry.id}>
                    <strong>{entry.action}</strong>
                    <span>{entry.user?.email || 'System'} · {formatDate(entry.createdAt)}</span>
                  </div>
                ))}
              </div>
            </article>
            <article className="dialog-card">
              <h3>Benutzerstatus</h3>
              <div className="profile-detail-list">
                <div><span>Aktiv</span><strong>{stats?.activeUserCount ?? 0}</strong></div>
                <div><span>Inaktiv</span><strong>{stats?.inactiveUserCount ?? 0}</strong></div>
                <div><span>Gesamt</span><strong>{stats?.userCount ?? 0}</strong></div>
              </div>
            </article>
          </section>
        ) : activeTab === 'users' ? (
          <section className="admin-table-card">
            <div className="admin-table-scroll">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Benutzer</th>
                    <th>Rolle</th>
                    <th>Status</th>
                    <th>Erstellt</th>
                    <th>Aktionen</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((targetUser) => (
                    <tr key={targetUser.id}>
                      <td>
                        <strong>{targetUser.profile?.displayName || targetUser.name}</strong>
                        <span>{targetUser.email}</span>
                      </td>
                      <td>
                        <select
                          className="input admin-select"
                          value={targetUser.globalRole}
                          disabled={busyAction.startsWith(targetUser.id)}
                          onChange={(event) => updateUser(targetUser, { globalRole: event.target.value === 'USER' ? null : event.target.value })}
                        >
                          {roles.map((role) => <option key={role} value={role}>{role}</option>)}
                        </select>
                      </td>
                      <td>
                        <select
                          className="input admin-select"
                          value={targetUser.status}
                          disabled={busyAction.startsWith(targetUser.id)}
                          onChange={(event) => updateUser(targetUser, { status: event.target.value as AdminUser['status'] })}
                        >
                          {statuses.map((status) => <option key={status} value={status}>{status}</option>)}
                        </select>
                      </td>
                      <td>{formatDate(targetUser.createdAt)}</td>
                      <td>
                        <div className="admin-row-actions">
                          <button className="text-button" disabled={busyAction.startsWith(targetUser.id)} onClick={() => revokeSessions(targetUser)}>Sessions widerrufen</button>
                          <button className="text-button danger" disabled={busyAction.startsWith(targetUser.id)} onClick={() => deleteUser(targetUser)}>Loeschen</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : activeTab === 'audit' ? (
          <section className="admin-table-card">
            <div className="admin-table-scroll">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Zeitpunkt</th>
                    <th>Benutzer</th>
                    <th>Aktion</th>
                    <th>Ressource</th>
                    <th>IP</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.map((entry) => (
                    <tr key={entry.id}>
                      <td>{formatDate(entry.createdAt)}</td>
                      <td>{entry.user?.email || 'System'}</td>
                      <td><code>{entry.action}</code></td>
                      <td>{entry.resourceType}{entry.resourceId ? `:${entry.resourceId}` : ''}</td>
                      <td>{entry.ipAddress || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : (
          <section className="groupware-grid">
            <article className="dialog-card">
              <h3>Health</h3>
              <div className="profile-detail-list">
                <div><span>API</span><strong>Online, wenn diese Seite Daten laedt</strong></div>
                <div><span>Audit Logs</span><strong>{stats?.auditLogCount ?? 0}</strong></div>
                <div><span>Aktive Sessions</span><strong>{stats?.sessionCount ?? 0}</strong></div>
              </div>
            </article>
            <article className="dialog-card">
              <h3>Betrieb</h3>
              <ol className="groupware-steps">
                <li>Backups regelmaessig pruefen.</li>
                <li>Docker Images geplant aktualisieren.</li>
                <li>Admin-Accounts sparsam vergeben.</li>
                <li>Sessions nach Passwortwechsel widerrufen.</li>
              </ol>
            </article>
          </section>
        )}
      </main>
    </div>
  );
}
