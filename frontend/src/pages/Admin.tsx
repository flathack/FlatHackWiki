import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../context/auth.store';

interface AuditEntry {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string;
  ipAddress: string;
  createdAt: string;
  user?: { name: string; email: string };
}

interface User {
  id: string;
  name: string;
  email: string;
  status: string;
  globalRole: string;
}

export default function AdminPage() {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'users' | 'audit'>('users');
  const [users, setUsers] = useState<User[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const isAdmin = user?.globalRole === 'SUPER_ADMIN' || user?.globalRole === 'SYSTEM_ADMIN';

  useEffect(() => {
    if (isAdmin) loadData();
    else setLoading(false);
  }, [isAdmin]);

  const loadData = async () => {
    setLoading(false);
  };

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-bold text-red-600 mb-2">Zugriff verweigert</h2>
          <p className="text-gray-500">Du benötigst Administratorrechte, um diese Seite aufzurufen.</p>
          <Link to="/" className="text-blue-600 mt-4 block">← Zurück zur Startseite</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <Link to="/" className="text-gray-500 hover:text-gray-700">← Startseite</Link>
            <span className="text-gray-300">/</span>
            <span className="font-medium">Admin</span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-bold mb-6">Administration</h1>

        <div className="flex gap-4 border-b border-gray-200 mb-6">
          <button
            onClick={() => setActiveTab('users')}
            className={`pb-2 px-4 font-medium ${
              activeTab === 'users'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Benutzer
          </button>
          <button
            onClick={() => setActiveTab('audit')}
            className={`pb-2 px-4 font-medium ${
              activeTab === 'audit'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Audit-Protokoll
          </button>
        </div>

        {loading ? (
          <div className="text-gray-500">Wird geladen...</div>
        ) : activeTab === 'users' ? (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">E-Mail</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rolle</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Aktionen</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {users.map((u) => (
                  <tr key={u.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">{u.name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{u.email}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs">
                        {u.globalRole}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <span className={`px-2 py-1 rounded text-xs ${
                        u.status === 'ACTIVE' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {u.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <button className="text-blue-600 hover:text-blue-800 mr-3">Bearbeiten</button>
                      <button className="text-red-600 hover:text-red-800">Löschen</button>
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-4 text-center text-gray-500">
                      Keine Benutzer gefunden
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Zeitpunkt</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Benutzer</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Aktion</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ressource</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">IP</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {auditLogs.map((log) => (
                  <tr key={log.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(log.createdAt).toLocaleString('de-DE')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">{log.user?.name || 'System'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-mono">{log.action}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {log.resourceType}:{log.resourceId}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">{log.ipAddress}</td>
                  </tr>
                ))}
                {auditLogs.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-4 text-center text-gray-500">
                      Noch keine Audit-Einträge vorhanden
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
