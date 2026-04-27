import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { pagesApi } from '../api/client';
import RichTextEditor from '../components/editor/RichTextEditor';
import { PAGE_TEMPLATES, getTemplate } from '../utils/templates';
import AppHeader from '../components/AppHeader';

export default function PageEditor() {
  const { key, slug, template: templateId } = useParams<{ key: string; slug?: string; template?: string }>();
  const isNew = !slug || slug === 'new';
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!isNew);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    if (!isNew && key && slug) {
      loadPage();
    } else if (templateId) {
      const template = getTemplate(templateId);
      if (template) {
        setContent(template.content);
      }
    }
  }, [key, slug, isNew, templateId]);

  const loadPage = async () => {
    try {
      const { data } = await pagesApi.get(key!, slug!);
      setTitle(data.title);
      setContent(data.content || '');
    } catch (err) {
      console.error('Seite konnte nicht geladen werden:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!title.trim()) {
      setError('Ein Titel ist erforderlich');
      return;
    }
    setError('');
    setSaving(true);

    const pageSlug = isNew
      ? title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
      : slug!;

    try {
      if (isNew) {
        await pagesApi.create(key!, { title, slug: pageSlug, content });
      } else {
        await pagesApi.update(key!, slug!, { title, content });
      }
      navigate(`/spaces/${key}/pages/${pageSlug}`);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Seite konnte nicht gespeichert werden');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500">Wird geladen...</div>
      </div>
    );
  }

  return (
    <div className="dashboard-page-shell">
      <AppHeader
        subtitle={isNew ? `Neue Seite in ${key}` : `Bearbeiten: ${slug}`}
        actions={(
          <>
            <button onClick={() => navigate(`/spaces/${key}`)} className="btn btn-secondary">Abbrechen</button>
            <button onClick={handleSave} disabled={saving} className="btn btn-primary">{saving ? 'Speichert...' : 'Speichern'}</button>
          </>
        )}
      />

      <main className="max-w-4xl mx-auto px-6 py-8">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
              {error}
            </div>
          )}

          {isNew && templateId === undefined && (
            <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
              <h3 className="font-medium mb-3">Vorlage wählen (optional)</h3>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {PAGE_TEMPLATES.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setContent(t.content)}
                    className="p-3 text-center border border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors"
                    title={t.description}
                  >
                    <div className="text-2xl mb-1">{t.icon}</div>
                    <div className="text-xs font-medium">{t.name}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Titel</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="input text-xl font-bold"
              placeholder="Seitentitel"
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Inhalt (.md)</label>
            <RichTextEditor
              value={content}
              onChange={setContent}
              placeholder="Beginne mit dem Schreiben in Markdown (.md)..."
            />
          </div>

          <div className="flex gap-4 text-sm text-gray-500">
            <span>Gespeichertes Format: Markdown (.md)</span>
            <span>Unterstützt: **fett**, *kursiv*, # Überschriften, Listen, Codeblöcke, Links</span>
          </div>
        </div>
      </main>
    </div>
  );
}
