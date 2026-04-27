import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { pagesApi, Page } from '../api/client';
import { renderMarkdown } from '../utils/markdown';
import AppHeader from '../components/AppHeader';

export default function PageView() {
  const { key, slug } = useParams<{ key: string; slug: string }>();
  const [page, setPage] = useState<Page | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    if (key && slug) loadPage();
  }, [key, slug]);

  const loadPage = async () => {
    try {
      const { data } = await pagesApi.get(key!, slug!);
      setPage(data);
    } catch (err) {
      console.error('Seite konnte nicht geladen werden:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Diese Seite wirklich löschen?')) return;
    try {
      await pagesApi.delete(key!, slug!);
      navigate(`/spaces/${key}`);
    } catch (err) {
      console.error('Seite konnte nicht gelöscht werden:', err);
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Wird geladen...</div>;
  }

  if (!page) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-bold text-gray-700 mb-2">Seite nicht gefunden</h2>
          <Link to={`/spaces/${key}`} className="text-blue-600">← Zurück zum Bereich</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-page-shell">
      <AppHeader
        subtitle={`${key} / ${page.title}`}
        actions={(
          <>
            <Link to={`/spaces/${key}`} className="btn btn-secondary text-sm">Zurück</Link>
            <Link to={`/spaces/${key}/pages/${slug}/edit`} className="btn btn-secondary text-sm">Bearbeiten</Link>
            <button onClick={handleDelete} className="btn btn-secondary text-sm text-red-600">Löschen</button>
          </>
        )}
      />

      <div className="bg-gray-100 border-b border-gray-200 px-6 py-2">
        <nav className="text-sm text-gray-500">
          <Link to="/" className="hover:text-gray-700">Startseite</Link>
          <span className="mx-2">/</span>
          <Link to={`/spaces/${key}`} className="hover:text-gray-700">{key}</Link>
          <span className="mx-2">/</span>
          <span className="text-gray-700">{page.title}</span>
        </nav>
      </div>

      <main className="max-w-4xl mx-auto px-6 py-8">
        <article className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
          <h1 className="text-3xl font-bold mb-6">{page.title}</h1>
          <div className="markdown-content max-w-none">
            {page.content ? (
              <div dangerouslySetInnerHTML={{ __html: renderMarkdown(page.content) }} />
            ) : (
              <p className="text-gray-500 italic">Noch kein Inhalt vorhanden.</p>
            )}
          </div>
        </article>

        <div className="mt-8 flex gap-4 text-sm text-gray-500">
          <span>Status: {page.status}</span>
          <span>Erstellt: {new Date(page.createdAt).toLocaleDateString('de-DE')}</span>
          <span>Aktualisiert: {new Date(page.updatedAt).toLocaleDateString('de-DE')}</span>
        </div>
      </main>
    </div>
  );
}
