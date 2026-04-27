import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { spacesApi, pagesApi, Space, Page } from '../api/client';
import AppHeader from '../components/AppHeader';

interface TreeNode extends Page {
  children: TreeNode[];
}

export default function SpacePage() {
  const { key } = useParams<{ key: string }>();
  const [space, setSpace] = useState<Space | null>(null);
  const [pages, setPages] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (key) loadData();
  }, [key]);

  const loadData = async () => {
    try {
      const [spaceRes, pagesRes] = await Promise.all([
        spacesApi.get(key!),
        pagesApi.list(key!),
      ]);
      setSpace(spaceRes.data);
      setPages(buildTree(pagesRes.data));
    } catch (err) {
      console.error('Bereich konnte nicht geladen werden:', err);
    } finally {
      setLoading(false);
    }
  };

  const buildTree = (flatPages: Page[]): TreeNode[] => {
    const map = new Map<string, TreeNode>();
    const roots: TreeNode[] = [];

    flatPages.forEach((p) => {
      map.set(p.id, { ...p, children: [] });
    });

    flatPages.forEach((p) => {
      const node = map.get(p.id)!;
      if (p.parentId) {
        map.get(p.parentId)?.children.push(node);
      } else {
        roots.push(node);
      }
    });

    return roots;
  };

  const renderTree = (nodes: TreeNode[], depth = 0) => (
    <ul className={depth > 0 ? 'pl-4' : ''}>
      {nodes.map((node) => (
        <li key={node.id} className="py-1">
          <Link
            to={`/spaces/${key}/pages/${node.slug}`}
            className="text-blue-600 hover:text-blue-800 text-sm flex items-center gap-2"
          >
            <span className="text-gray-400">•</span>
            {node.title}
          </Link>
          {node.children.length > 0 && renderTree(node.children, depth + 1)}
        </li>
      ))}
    </ul>
  );

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Wird geladen...</div>;
  }

  return (
    <div className="dashboard-page-shell">
      <AppHeader
        subtitle={space?.description || `Bereich ${space?.name || key}`}
        actions={<Link to={`/spaces/${key}/pages/new`} className="btn btn-primary">Neue Seite</Link>}
      />

      <div className="flex flex-col md:flex-row">
        <aside className="w-64 bg-white border-r border-gray-200 min-h-screen p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-700">Seiten</h3>
            <Link
              to={`/spaces/${key}/pages/new`}
              className="text-sm bg-blue-100 text-blue-600 px-2 py-1 rounded hover:bg-blue-200"
            >
              + Neu
            </Link>
          </div>
          <div className="text-sm">
            {pages.length === 0 ? (
              <p className="text-gray-500">Noch keine Seiten vorhanden</p>
            ) : (
              renderTree(pages)
            )}
          </div>
        </aside>

        <main className="flex-1 p-8">
          <div className="max-w-4xl mx-auto">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
              <h2 className="text-2xl font-bold text-gray-700 mb-4">Willkommen in {space?.name}</h2>
              <p className="text-gray-500 mb-6">{space?.description}</p>
              <div className="text-sm text-gray-400">
                <p>Besitzer: {space?.owner?.name}</p>
                <p>Sichtbarkeit: {space?.visibility}</p>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
