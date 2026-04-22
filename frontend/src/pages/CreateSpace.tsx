import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { spacesApi } from '../api/client';

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
      setError('Name and key are required');
      return;
    }
    if (!/^[a-z][a-z0-9-]*$/.test(key)) {
      setError('Key must start with letter and contain only lowercase letters, numbers, and hyphens');
      return;
    }
    setError('');
    setSaving(true);
    try {
      await spacesApi.create({ name, key, description, visibility });
      navigate(`/spaces/${key}`);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to create space');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-lg">
        <h1 className="text-2xl font-bold mb-6">Create New Space</h1>
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="Engineering Wiki" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Key (URL slug)</label>
            <input type="text" value={key} onChange={(e) => setKey(e.target.value.toLowerCase())} className="input font-mono" placeholder="eng" required />
            <p className="text-xs text-gray-500 mt-1">Used in URLs: /spaces/{key || 'key'}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="input" rows={3} placeholder="What is this space for?" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Visibility</label>
            <select value={visibility} onChange={(e) => setVisibility(e.target.value)} className="input">
              <option value="PRIVATE">Private - Only members can access</option>
              <option value="PUBLIC">Public - Anyone can view</option>
              <option value="RESTRICTED">Restricted - Requires permission</option>
            </select>
          </div>
          <div className="flex gap-4 pt-4">
            <button type="button" onClick={() => navigate('/')} className="btn btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={saving} className="btn btn-primary flex-1">{saving ? 'Creating...' : 'Create Space'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
