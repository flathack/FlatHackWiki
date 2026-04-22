import { useEffect, useState } from 'react';
import { spacesApi } from '../../api/client';

interface Member {
  user: { id: string; name: string; email: string };
  role: string;
  addedAt: string;
}

interface SpaceSettingsProps {
  spaceKey: string;
  currentUserId: string;
}

const ROLES = ['SPACE_ADMIN', 'EDITOR', 'AUTHOR', 'COMMENTER', 'VIEWER'];

export default function SpaceSettings({ spaceKey, currentUserId }: SpaceSettingsProps) {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadMembers();
  }, [spaceKey]);

  const loadMembers = async () => {
    try {
      const { data } = await spacesApi.members.list(spaceKey);
      setMembers(data);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to load members');
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    try {
      await spacesApi.members.update(spaceKey, userId, newRole);
      setMembers(members.map(m => 
        m.user.id === userId ? { ...m, role: newRole } : m
      ));
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to update role');
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!confirm('Remove this member?')) return;
    try {
      await spacesApi.members.remove(spaceKey, userId);
      setMembers(members.filter(m => m.user.id !== userId));
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to remove member');
    }
  };

  if (loading) return <div className="text-gray-500">Loading members...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4">Space Members</h3>
        
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">User</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Joined</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {members.map((member) => (
                <tr key={member.user.id}>
                  <td className="px-4 py-3">
                    <div className="font-medium">{member.user.name}</div>
                    <div className="text-sm text-gray-500">{member.user.email}</div>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={member.role}
                      onChange={(e) => handleRoleChange(member.user.id, e.target.value)}
                      className="text-sm border border-gray-300 rounded px-2 py-1"
                    >
                      {ROLES.map((role) => (
                        <option key={role} value={role}>{role}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {new Date(member.addedAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {member.user.id !== currentUserId && (
                      <button
                        onClick={() => handleRemoveMember(member.user.id)}
                        className="text-red-600 hover:text-red-800 text-sm"
                      >
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
