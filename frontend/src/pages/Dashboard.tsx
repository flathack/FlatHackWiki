import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { spacesApi, Space } from '../api/client';
import { useAuthStore } from '../context/auth.store';

export default function Dashboard() {
  const { user, logout } = useAuthStore();
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadSpaces();
  }, []);

  const loadSpaces = async () => {
    try {
      const { data } = await spacesApi.list();
      setSpaces(data);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to load spaces');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold text-gray-900">OpenClaw Wiki</h1>
          </div>
          <div className="flex items-center gap-4">
            <Link to="/admin" className="text-sm text-gray-600 hover:text-gray-900">
              Admin
            </Link>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{user?.name}</span>
              <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">{user?.globalRole}</span>
            </div>
            <button onClick={logout} className="text-sm text-red-600 hover:text-red-800">
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-2xl font-bold">Your Spaces</h2>
          <Link to="/spaces/new" className="btn btn-primary">
            + Create Space
          </Link>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-gray-500">Loading spaces...</div>
          </div>
        ) : error ? (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
            <button onClick={loadSpaces} className="ml-4 underline">Retry</button>
          </div>
        ) : spaces.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="text-6xl mb-4">📚</div>
            <p className="text-gray-500 mb-4">No spaces yet. Create your first wiki space!</p>
            <Link to="/spaces/new" className="btn btn-primary">
              Create Space
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {spaces.map((space) => (
              <Link
                key={space.id}
                to={`/spaces/${space.key}`}
                className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow cursor-pointer"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg text-gray-900">{space.name}</h3>
                    <p className="text-sm text-gray-500 mt-1 font-mono">{space.key}</p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded ${
                    space.visibility === 'PUBLIC' ? 'bg-green-100 text-green-800' : 
                    space.visibility === 'RESTRICTED' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {space.visibility}
                  </span>
                </div>
                {space.description && (
                  <p className="text-sm text-gray-600 mt-3 line-clamp-2">{space.description}</p>
                )}
                <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
                  <span>👤 {space.owner?.name || 'Unknown'}</span>
                  <span className="text-blue-600 hover:text-blue-800">Open →</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
