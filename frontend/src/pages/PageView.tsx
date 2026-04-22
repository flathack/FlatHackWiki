import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { pagesApi, Page } from '../api/client';

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
      console.error('Failed to load page:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this page?')) return;
    try {
      await pagesApi.delete(key!, slug!);
      navigate(`/spaces/${key}`);
    } catch (err) {
      console.error('Failed to delete page:', err);
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  if (!page) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-bold text-gray-700 mb-2">Page not found</h2>
          <Link to={`/spaces/${key}`} className="text-blue-600">← Back to Space</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <Link to={`/spaces/${key}`} className="text-gray-500 hover:text-gray-700">
              ← {key}
            </Link>
            <span className="text-gray-300">/</span>
            <span className="font-medium">{page.title}</span>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to={`/spaces/${key}/pages/${slug}/edit`}
              className="btn btn-secondary text-sm"
            >
              Edit
            </Link>
            <button onClick={handleDelete} className="btn btn-secondary text-sm text-red-600">
              Delete
            </button>
          </div>
        </div>
      </header>

      {/* Breadcrumbs */}
      <div className="bg-gray-100 border-b border-gray-200 px-6 py-2">
        <nav className="text-sm text-gray-500">
          <Link to="/" className="hover:text-gray-700">Dashboard</Link>
          <span className="mx-2">/</span>
          <Link to={`/spaces/${key}`} className="hover:text-gray-700">{key}</Link>
          <span className="mx-2">/</span>
          <span className="text-gray-700">{page.title}</span>
        </nav>
      </div>

      {/* Page Content */}
      <main className="max-w-4xl mx-auto px-6 py-8">
        <article className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
          <h1 className="text-3xl font-bold mb-6">{page.title}</h1>
          <div className="prose max-w-none">
            {page.content ? (
              <div dangerouslySetInnerHTML={{ __html: page.content }} />
            ) : (
              <p className="text-gray-500 italic">No content yet.</p>
            )}
          </div>
        </article>

        {/* Page Metadata */}
        <div className="mt-8 flex gap-4 text-sm text-gray-500">
          <span>Status: {page.status}</span>
          <span>Created: {new Date(page.createdAt).toLocaleDateString()}</span>
          <span>Updated: {new Date(page.updatedAt).toLocaleDateString()}</span>
        </div>
      </main>
    </div>
  );
}
