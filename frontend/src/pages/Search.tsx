import { useSearchParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { searchApi } from '../api/client';

interface SearchResult {
  type: string;
  id: string;
  title: string;
  excerpt: string;
  space: { key: string; name: string };
  author: { name: string };
  updatedAt: string;
  score: number;
}

export default function Search() {
  const [searchParams] = useSearchParams();
  const query = searchParams.get('q') || '';
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState(query);

  useEffect(() => {
    if (query) performSearch();
  }, [query]);

  const performSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const { data } = await searchApi.search({ q: query });
      setResults(data.results || []);
    } catch (err) {
      console.error('Suche fehlgeschlagen:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <h1 className="text-xl font-bold mb-4">Suche</h1>
          <div className="flex gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && window.location.assign(`/search?q=${encodeURIComponent(searchQuery)}`)}
              className="input flex-1"
              placeholder="Seiten, Inhalte und Bereiche durchsuchen..."
            />
            <button
              onClick={() => window.location.assign(`/search?q=${encodeURIComponent(searchQuery)}`)}
              className="btn btn-primary"
            >
              Suchen
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        {loading ? (
          <div className="text-center py-12 text-gray-500">Suche läuft...</div>
        ) : results.length === 0 && query ? (
          <div className="text-center py-12">
            <p className="text-gray-500">Keine Ergebnisse für "{query}" gefunden</p>
          </div>
        ) : results.length > 0 ? (
          <div className="space-y-4">
            <p className="text-sm text-gray-500 mb-4">{results.length} Ergebnisse gefunden</p>
            {results.map((result) => (
              <Link
                key={`${result.type}-${result.id}`}
                to={result.type === 'page' ? `/spaces/${result.space.key}/pages/${result.id}` : '#'}
                className="block bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-xs bg-gray-200 px-2 py-1 rounded uppercase">{result.type}</span>
                    <h3 className="font-semibold text-lg mt-1">{result.title}</h3>
                    <p className="text-sm text-gray-600 mt-1" dangerouslySetInnerHTML={{ __html: result.excerpt }} />
                  </div>
                  <span className="text-sm text-gray-400">{Math.round(result.score * 100)}%</span>
                </div>
                <div className="mt-2 text-xs text-gray-500">
                  {result.space.name} • {result.author?.name || 'Unbekannt'} • {new Date(result.updatedAt).toLocaleDateString('de-DE')}
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-gray-500">
            <p>Gib einen Suchbegriff ein, um Seiten, Bereiche und mehr zu finden.</p>
          </div>
        )}
      </main>
    </div>
  );
}
