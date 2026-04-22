import { useEffect, useState } from 'react';
import { api } from '../../api/client';

interface Comment {
  id: string;
  content: string;
  user: { id: string; name: string };
  createdAt: string;
  status: string;
}

interface CommentsProps {
  pageId: string;
  currentUserId: string;
}

export default function Comments({ pageId, currentUserId }: CommentsProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadComments(); }, [pageId]);

  const loadComments = async () => {
    try {
      const { data } = await api.get(`/pages/${pageId}/comments`);
      setComments(data);
    } catch (err) {
      console.error('Failed to load comments:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;
    try {
      const { data } = await api.post(`/pages/${pageId}/comments`, { content: newComment });
      setComments([...comments, data]);
      setNewComment('');
    } catch (err) {
      console.error('Failed to add comment:', err);
    }
  };

  const handleDelete = async (commentId: string) => {
    if (!confirm('Delete this comment?')) return;
    try {
      await api.delete(`/pages/${pageId}/comments/${commentId}`);
      setComments(comments.filter((c) => c.id !== commentId));
    } catch (err) {
      console.error('Failed to delete comment:', err);
    }
  };

  if (loading) return <div className="text-gray-500">Loading comments...</div>;

  return (
    <div className="mt-8 border-t border-gray-200 pt-8">
      <h3 className="text-lg font-semibold mb-4">Comments ({comments.length})</h3>
      <form onSubmit={handleSubmit} className="mb-6">
        <textarea value={newComment} onChange={(e) => setNewComment(e.target.value)} className="input mb-2" rows={3} placeholder="Write a comment..." />
        <button type="submit" className="btn btn-primary text-sm">Add Comment</button>
      </form>
      <div className="space-y-4">
        {comments.length === 0 ? (
          <p className="text-gray-500 text-sm">No comments yet.</p>
        ) : (
          comments.map((comment) => (
            <div key={comment.id} className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-start justify-between">
                <div>
                  <span className="font-medium text-sm">{comment.user?.name || 'Unknown'}</span>
                  <span className="text-xs text-gray-500 ml-2">{new Date(comment.createdAt).toLocaleString()}</span>
                </div>
                {comment.user.id === currentUserId && (
                  <button onClick={() => handleDelete(comment.id)} className="text-red-600 hover:text-red-800 text-sm">Delete</button>
                )}
              </div>
              <p className="mt-2 text-gray-700">{comment.content}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
