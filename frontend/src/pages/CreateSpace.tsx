import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { spacesApi } from '../api/client';
import AppHeader from '../components/AppHeader';

export default function CreateSpace() {
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState('PRIVATE');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !key.trim()) {
      setError('Name und Schlüssel sind erforderlich');
      return;
    }
    if (!/^[a-z][a-z0-9-]*$/.test(key)) {
      setError('Der Schlüssel muss mit einem Buchstaben beginnen und darf nur Kleinbuchstaben, Zahlen und Bindestriche enthalten');
      return;
    }
    setError('');
    setSaving(true);
    try {
      await spacesApi.create({ name, key, description, visibility });
      navigate(`/spaces/${key}`);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Bereich konnte nicht erstellt werden');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="dashboard-page-shell">
      <AppHeader subtitle="Neuen Wiki-Bereich erstellen." />
      <main className="flex min-h-[calc(100vh-5rem)] items-center justify-center px-4 py-8">
      <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-lg">
        <h1 className="text-2xl font-bold mb-6">Neuen Bereich erstellen</h1>
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="Technik-Wiki" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Schlüssel (URL-Slug)</label>
            <input type="text" value={key} onChange={(e) => setKey(e.target.value.toLowerCase())} className="input font-mono" placeholder="technik" required />
            <p className="text-xs text-gray-500 mt-1">Wird in URLs verwendet: /spaces/{key || 'schluessel'}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Beschreibung</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="input" rows={3} placeholder="Wofür ist dieser Bereich gedacht?" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Sichtbarkeit</label>
            <select value={visibility} onChange={(e) => setVisibility(e.target.value)} className="input">
              <option value="PRIVATE">Privat - Nur Mitglieder haben Zugriff</option>
              <option value="PUBLIC">Öffentlich - Jeder kann den Bereich ansehen</option>
              <option value="RESTRICTED">Eingeschränkt - Zugriff nur mit Berechtigung</option>
            </select>
          </div>
          <div className="flex gap-4 pt-4">
            <button type="button" onClick={() => navigate('/')} className="btn btn-secondary flex-1">Abbrechen</button>
            <button type="submit" disabled={saving} className="btn btn-primary flex-1">{saving ? 'Wird erstellt...' : 'Bereich erstellen'}</button>
          </div>
        </form>
      </div>
      </main>
    </div>
  );
}
