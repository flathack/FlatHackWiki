import { useEffect, useMemo, useState } from 'react';
import AppHeader from '../components/AppHeader';
import { dashboardApi, type BookmarkItem, type BookmarkState } from '../api/client';

type BookmarkView = 'list' | 'cards' | 'table';
type SmartFilter = 'all' | 'favorites' | 'pinned' | 'archive' | 'broken';
type EditorMode = 'bookmark' | 'folder';

type BookmarkForm = {
  id?: string;
  itemType: 'BOOKMARK' | 'FOLDER';
  title: string;
  url: string;
  description: string;
  notes: string;
  parentId: string;
  tagsText: string;
  category: string;
  isFavorite: boolean;
  isPinned: boolean;
  isArchived: boolean;
  showInToolbar: boolean;
};

const emptyForm: BookmarkForm = {
  itemType: 'BOOKMARK',
  title: '',
  url: '',
  description: '',
  notes: '',
  parentId: '',
  tagsText: '',
  category: '',
  isFavorite: false,
  isPinned: false,
  isArchived: false,
  showInToolbar: true,
};

function flattenBookmarks(nodes: BookmarkItem[]): BookmarkItem[] {
  return nodes.flatMap((node) => [node, ...flattenBookmarks(node.children ?? [])]);
}

function countBookmarkChildren(node: BookmarkItem): number {
  return node.children.reduce(
    (count, child) => count + (child.itemType === 'BOOKMARK' ? 1 : 0) + countBookmarkChildren(child),
    0
  );
}

function isInsideFolder(item: BookmarkItem, folderId: string, itemMap: Map<string, BookmarkItem>) {
  let currentParentId = item.parentId;
  while (currentParentId) {
    if (currentParentId === folderId) return true;
    currentParentId = itemMap.get(currentParentId)?.parentId ?? null;
  }
  return false;
}

function getInitials(value: string) {
  return value
    .split(/\s+/)
    .map((part) => part.slice(0, 1))
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function getDomain(value?: string | null) {
  if (!value) return '';
  try {
    return new URL(value).hostname.replace(/^www\./, '');
  } catch {
    return value;
  }
}

function tagsFromText(value: string) {
  return [...new Set(value.split(',').map((tag) => tag.trim()).filter(Boolean))];
}

function toForm(item?: BookmarkItem | null, mode: EditorMode = 'bookmark'): BookmarkForm {
  if (!item) {
    return { ...emptyForm, itemType: mode === 'folder' ? 'FOLDER' : 'BOOKMARK' };
  }

  return {
    id: item.id,
    itemType: item.itemType,
    title: item.title,
    url: item.url ?? '',
    description: item.description ?? '',
    notes: item.notes ?? '',
    parentId: item.parentId ?? '',
    tagsText: (item.tags ?? []).join(', '),
    category: item.category ?? '',
    isFavorite: item.isFavorite,
    isPinned: item.isPinned,
    isArchived: item.isArchived,
    showInToolbar: item.showInToolbar,
  };
}

function downloadTextFile(fileName: string, content: string, contentType: string) {
  const blob = new Blob([content], { type: contentType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function BookmarkFolderTree({
  folders,
  activeFolderId,
  onSelectFolder,
  onCreateChild,
  onEditFolder,
  onDeleteFolder,
  depth = 0,
}: {
  folders: BookmarkItem[];
  activeFolderId: string;
  onSelectFolder: (folderId: string) => void;
  onCreateChild: (folder: BookmarkItem) => void;
  onEditFolder: (folder: BookmarkItem) => void;
  onDeleteFolder: (folder: BookmarkItem) => void;
  depth?: number;
}) {
  return (
    <div className="bookmark-folder-tree">
      {folders.map((folder) => {
        const childFolders = folder.children.filter((child) => child.itemType === 'FOLDER');
        const bookmarkCount = countBookmarkChildren(folder);

        return (
          <div key={folder.id} className="bookmark-folder-tree-node">
            <div
              className={`bookmark-folder-tree-row ${activeFolderId === folder.id ? 'active' : ''}`}
              style={{ paddingLeft: `${depth * 14 + 8}px` }}
            >
              <button type="button" className="bookmark-folder-tree-main" onClick={() => onSelectFolder(folder.id)}>
                <span className="bookmark-folder-tree-caret">{childFolders.length > 0 ? '▾' : '•'}</span>
                <span className="bookmark-folder-tree-name">{folder.title}</span>
                <strong>{bookmarkCount}</strong>
              </button>
              <div className="bookmark-folder-tree-actions">
                <button type="button" title="Unterordner anlegen" onClick={() => onCreateChild(folder)}>+</button>
                <button type="button" title="Ordner bearbeiten" onClick={() => onEditFolder(folder)}>✎</button>
                <button type="button" title="Ordner löschen" onClick={() => onDeleteFolder(folder)}>×</button>
              </div>
            </div>
            {childFolders.length > 0 && (
              <BookmarkFolderTree
                folders={childFolders}
                activeFolderId={activeFolderId}
                onSelectFolder={onSelectFolder}
                onCreateChild={onCreateChild}
                onEditFolder={onEditFolder}
                onDeleteFolder={onDeleteFolder}
                depth={depth + 1}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function BookmarksPage() {
  const [bookmarks, setBookmarks] = useState<BookmarkState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [smartFilter, setSmartFilter] = useState<SmartFilter>('all');
  const [activeFolderId, setActiveFolderId] = useState<string>('all');
  const [activeTag, setActiveTag] = useState<string>('all');
  const [view, setView] = useState<BookmarkView>('list');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [form, setForm] = useState<BookmarkForm>(emptyForm);
  const [quickUrl, setQuickUrl] = useState('');
  const [importText, setImportText] = useState('');

  const loadBookmarks = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await dashboardApi.bookmarks.list();
      setBookmarks(data);
      if (!activeItemId) {
        const first = flattenBookmarks(data.tree).find((item) => item.itemType === 'BOOKMARK');
        setActiveItemId(first?.id ?? null);
      }
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Lesezeichen konnten nicht geladen werden');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadBookmarks();
  }, []);

  const allItems = useMemo(() => flattenBookmarks(bookmarks?.tree ?? []), [bookmarks]);
  const folders = useMemo(() => allItems.filter((item) => item.itemType === 'FOLDER'), [allItems]);
  const rootFolders = useMemo(() => (bookmarks?.tree ?? []).filter((item) => item.itemType === 'FOLDER'), [bookmarks?.tree]);
  const itemMap = useMemo(() => new Map(allItems.map((item) => [item.id, item])), [allItems]);
  const allTags = useMemo(
    () => [...new Set(allItems.flatMap((item) => item.tags ?? []))].sort((a, b) => a.localeCompare(b, 'de')),
    [allItems]
  );
  const activeItem = allItems.find((item) => item.id === activeItemId) ?? null;
  const duplicateMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of allItems) {
      if (item.itemType !== 'BOOKMARK') continue;
      const key = item.normalizedUrl || item.url;
      if (!key) continue;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [allItems]);

  const visibleItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return allItems
      .filter((item) => item.itemType === 'BOOKMARK')
      .filter((item) => {
        if (smartFilter === 'favorites' && !item.isFavorite) return false;
        if (smartFilter === 'pinned' && !item.isPinned) return false;
        if (smartFilter === 'archive' && !item.isArchived) return false;
        if (smartFilter === 'broken' && item.linkStatus !== 'BROKEN') return false;
        if (smartFilter !== 'archive' && item.isArchived) return false;
        if (activeFolderId !== 'all' && item.parentId !== activeFolderId && !isInsideFolder(item, activeFolderId, itemMap)) return false;
        if (activeTag !== 'all' && !(item.tags ?? []).includes(activeTag)) return false;
        if (!normalizedQuery) return true;

        const haystack = [
          item.title,
          item.url,
          item.domain,
          item.description,
          item.notes,
          item.category,
          ...(item.tags ?? []),
        ].join(' ').toLowerCase();
        return haystack.includes(normalizedQuery);
      })
      .sort((a, b) => {
        if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
        if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1;
        return a.title.localeCompare(b.title, 'de');
      });
  }, [activeFolderId, activeTag, allItems, itemMap, query, smartFilter]);

  const selectedItems = visibleItems.filter((item) => selectedIds.includes(item.id));

  const startCreate = (mode: EditorMode = 'bookmark') => {
    setForm({
      ...toForm(null, mode),
      parentId: activeFolderId === 'all' ? '' : activeFolderId,
    });
    setActiveItemId(null);
  };

  const startCreateInFolder = (folder: BookmarkItem, mode: EditorMode = 'bookmark') => {
    setActiveFolderId(folder.id);
    setForm({
      ...toForm(null, mode),
      parentId: folder.id,
    });
    setActiveItemId(null);
  };

  const startEdit = (item: BookmarkItem) => {
    setForm(toForm(item));
    setActiveItemId(item.id);
  };

  const saveForm = async () => {
    setBusy(true);
    setError(null);
    try {
      const payload = {
        itemType: form.itemType,
        parentId: form.parentId || null,
        title: form.title.trim(),
        url: form.itemType === 'FOLDER' ? null : form.url.trim(),
        description: form.description || null,
        notes: form.notes || null,
        category: form.category || null,
        tags: tagsFromText(form.tagsText),
        isFavorite: form.isFavorite,
        isPinned: form.isPinned,
        isArchived: form.isArchived,
        showInToolbar: form.showInToolbar,
      };

      if (!payload.title) {
        setError('Bitte gib einen Titel ein.');
        return;
      }
      if (payload.itemType === 'BOOKMARK' && !payload.url) {
        setError('Bitte gib eine URL ein.');
        return;
      }

      if (form.id) {
        await dashboardApi.bookmarks.update(form.id, payload);
      } else {
        await dashboardApi.bookmarks.create(payload);
      }
      setForm(emptyForm);
      await loadBookmarks();
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Lesezeichen konnte nicht gespeichert werden');
    } finally {
      setBusy(false);
    }
  };

  const quickAdd = async () => {
    const url = quickUrl.trim();
    if (!url) return;

    setBusy(true);
    setError(null);
    try {
      await dashboardApi.bookmarks.create({
        itemType: 'BOOKMARK',
        title: getDomain(url) || url,
        url,
        parentId: activeFolderId === 'all' ? null : activeFolderId,
        tags: activeTag === 'all' ? [] : [activeTag],
        showInToolbar: true,
      });
      setQuickUrl('');
      await loadBookmarks();
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Lesezeichen konnte nicht schnell erfasst werden');
    } finally {
      setBusy(false);
    }
  };

  const updateItem = async (item: BookmarkItem, data: Partial<BookmarkItem>) => {
    setBusy(true);
    setError(null);
    try {
      await dashboardApi.bookmarks.update(item.id, data);
      await loadBookmarks();
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Lesezeichen konnte nicht aktualisiert werden');
    } finally {
      setBusy(false);
    }
  };

  const deleteItem = async (item: BookmarkItem) => {
    if (!window.confirm(`"${item.title}" wirklich löschen?`)) return;
    setBusy(true);
    setError(null);
    try {
      await dashboardApi.bookmarks.delete(item.id);
      setSelectedIds((current) => current.filter((id) => id !== item.id));
      if (activeItemId === item.id) setActiveItemId(null);
      if (activeFolderId === item.id) setActiveFolderId('all');
      await loadBookmarks();
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Lesezeichen konnte nicht gelöscht werden');
    } finally {
      setBusy(false);
    }
  };

  const openBookmark = async (item: BookmarkItem) => {
    if (!item.url) return;
    window.open(item.url, '_blank', 'noopener,noreferrer');
    void dashboardApi.bookmarks.update(item.id, { lastOpenedAt: new Date().toISOString() });
  };

  const bulkUpdate = async (data: Partial<BookmarkItem>) => {
    setBusy(true);
    setError(null);
    try {
      await Promise.all(selectedItems.map((item) => dashboardApi.bookmarks.update(item.id, data)));
      setSelectedIds([]);
      await loadBookmarks();
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Bulk-Aktion konnte nicht ausgeführt werden');
    } finally {
      setBusy(false);
    }
  };

  const exportJson = () => {
    downloadTextFile(
      `flathackwiki-bookmarks-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify({ exportedAt: new Date().toISOString(), items: allItems }, null, 2),
      'application/json;charset=utf-8'
    );
  };

  const exportCsv = () => {
    const rows = [
      ['title', 'url', 'domain', 'description', 'notes', 'tags', 'favorite', 'archived'],
      ...visibleItems.map((item) => [
        item.title,
        item.url ?? '',
        item.domain ?? '',
        item.description ?? '',
        item.notes ?? '',
        (item.tags ?? []).join('|'),
        String(item.isFavorite),
        String(item.isArchived),
      ]),
    ];
    const csv = rows
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    downloadTextFile(`flathackwiki-bookmarks-${new Date().toISOString().slice(0, 10)}.csv`, csv, 'text/csv;charset=utf-8');
  };

  const exportHtml = async () => {
    const { data } = await dashboardApi.bookmarks.exportHtml();
    downloadTextFile(data.fileName, data.html, 'text/html;charset=utf-8');
  };

  const importHtml = async () => {
    if (!importText.trim()) {
      setError('Bitte füge HTML-Importdaten ein.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await dashboardApi.bookmarks.importHtml(importText, 'append');
      setImportText('');
      await loadBookmarks();
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Import konnte nicht ausgeführt werden');
    } finally {
      setBusy(false);
    }
  };

  const toggleSelected = (itemId: string) => {
    setSelectedIds((current) => current.includes(itemId) ? current.filter((id) => id !== itemId) : [...current, itemId]);
  };

  return (
    <div className="dashboard-page-shell">
      <AppHeader
        subtitle="Moderner Lesezeichen-Manager für Recherche, Favoriten und große Link-Sammlungen."
        actions={<button className="btn btn-primary" onClick={() => startCreate('bookmark')}>Neu</button>}
      />

      <main className="bookmark-app-shell">
        <section className="bookmark-app-hero">
          <div>
            <div className="dashboard-hero-label">Lesezeichen</div>
            <h1 className="dashboard-hero-title">Deine Link-Zentrale</h1>
            <p className="dashboard-hero-copy">
              Suche, organisiere, archiviere und pflege deine Bookmarks direkt in FlatHackWiki.
            </p>
          </div>
          <div className="bookmark-quick-add">
            <input
              className="input"
              value={quickUrl}
              onChange={(event) => setQuickUrl(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void quickAdd();
              }}
              placeholder="URL schnell speichern"
            />
            <button className="btn btn-primary" onClick={quickAdd} disabled={busy}>Speichern</button>
          </div>
        </section>

        {error && <div className="widget-message widget-message-error">{error}</div>}

        <section className="bookmark-manager-layout">
          <aside className="bookmark-sidebar">
            <div className="bookmark-sidebar-section">
              <span className="bookmark-sidebar-title">Smart Lists</span>
              {[
                ['all', 'Alle aktiven', bookmarks?.bookmarkCount ?? 0],
                ['favorites', 'Favoriten', bookmarks?.favoriteCount ?? 0],
                ['pinned', 'Angepinnt', bookmarks?.pinnedCount ?? 0],
                ['archive', 'Archiv', bookmarks?.archivedCount ?? 0],
                ['broken', 'Defekte Links', allItems.filter((item) => item.linkStatus === 'BROKEN').length],
              ].map(([id, label, count]) => (
                <button
                  key={id}
                  className={`bookmark-sidebar-button ${smartFilter === id ? 'active' : ''}`}
                  onClick={() => setSmartFilter(id as SmartFilter)}
                >
                  <span>{label}</span>
                  <strong>{count}</strong>
                </button>
              ))}
            </div>

            <div className="bookmark-sidebar-section">
              <div className="bookmark-sidebar-heading">
                <span className="bookmark-sidebar-title">Ordner</span>
                <button className="text-button" onClick={() => startCreate('folder')}>Ordner +</button>
              </div>
              <button
                className={`bookmark-sidebar-button ${activeFolderId === 'all' ? 'active' : ''}`}
                onClick={() => setActiveFolderId('all')}
              >
                <span>Alle Ordner</span>
              </button>
              {rootFolders.length === 0 ? (
                <div className="bookmark-tree-empty">
                  Noch keine Ordner. Lege links oben deinen ersten Ordner an.
                </div>
              ) : (
                <BookmarkFolderTree
                  folders={rootFolders}
                  activeFolderId={activeFolderId}
                  onSelectFolder={(folderId) => setActiveFolderId(folderId)}
                  onCreateChild={(folder) => startCreateInFolder(folder, 'folder')}
                  onEditFolder={(folder) => startEdit(folder)}
                  onDeleteFolder={(folder) => void deleteItem(folder)}
                />
              )}
            </div>

            <div className="bookmark-sidebar-section">
              <span className="bookmark-sidebar-title">Tags</span>
              <button
                className={`bookmark-tag-filter ${activeTag === 'all' ? 'active' : ''}`}
                onClick={() => setActiveTag('all')}
              >
                Alle Tags
              </button>
              <div className="bookmark-tag-cloud">
                {allTags.map((tag) => (
                  <button
                    key={tag}
                    className={`bookmark-tag-filter ${activeTag === tag ? 'active' : ''}`}
                    onClick={() => setActiveTag(tag)}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          </aside>

          <section className="bookmark-content-panel">
            <div className="bookmark-toolbar">
              <input
                className="input"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Titel, URL, Beschreibung, Notizen oder Tags suchen"
              />
              <div className="bookmark-view-toggle">
                {(['list', 'cards', 'table'] as BookmarkView[]).map((mode) => (
                  <button key={mode} className={view === mode ? 'active' : ''} onClick={() => setView(mode)}>
                    {mode === 'list' ? 'Liste' : mode === 'cards' ? 'Karten' : 'Tabelle'}
                  </button>
                ))}
              </div>
            </div>

            {selectedIds.length > 0 && (
              <div className="bookmark-bulk-bar">
                <strong>{selectedIds.length} ausgewählt</strong>
                <button className="btn btn-secondary" onClick={() => void bulkUpdate({ isFavorite: true })}>Favorisieren</button>
                <button className="btn btn-secondary" onClick={() => void bulkUpdate({ isArchived: true })}>Archivieren</button>
                <button className="text-button danger" onClick={() => setSelectedIds([])}>Auswahl leeren</button>
              </div>
            )}

            {loading ? (
              <div className="page-loader">Lesezeichen werden geladen ...</div>
            ) : visibleItems.length === 0 ? (
              <div className="widget-message">Keine passenden Lesezeichen gefunden.</div>
            ) : view === 'table' ? (
              <div className="bookmark-table-wrap">
                <table className="bookmark-table">
                  <thead>
                    <tr>
                      <th></th>
                      <th>Titel</th>
                      <th>Domain</th>
                      <th>Tags</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleItems.map((item) => (
                      <tr key={item.id} className={activeItemId === item.id ? 'active' : ''} onClick={() => setActiveItemId(item.id)}>
                        <td><input type="checkbox" checked={selectedIds.includes(item.id)} onChange={() => toggleSelected(item.id)} onClick={(event) => event.stopPropagation()} /></td>
                        <td><strong>{item.title}</strong><small>{item.url}</small></td>
                        <td>{item.domain || getDomain(item.url)}</td>
                        <td>{(item.tags ?? []).join(', ')}</td>
                        <td>{item.linkStatus}</td>
                        <td><button className="text-button" onClick={(event) => { event.stopPropagation(); void openBookmark(item); }}>Öffnen</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className={view === 'cards' ? 'bookmark-card-grid' : 'bookmark-list'}>
                {visibleItems.map((item) => {
                  const duplicateCount = duplicateMap.get(item.normalizedUrl || item.url || '') ?? 0;
                  return (
                    <article
                      key={item.id}
                      className={`bookmark-result-card ${activeItemId === item.id ? 'active' : ''} ${view === 'cards' ? 'visual' : ''}`}
                      onClick={() => setActiveItemId(item.id)}
                    >
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(item.id)}
                        onChange={() => toggleSelected(item.id)}
                        onClick={(event) => event.stopPropagation()}
                      />
                      {item.faviconUrl ? <img src={item.faviconUrl} alt="" className="bookmark-result-icon" /> : <span className="bookmark-result-icon fallback">{getInitials(item.title)}</span>}
                      <div className="bookmark-result-copy">
                        <div className="bookmark-result-title-row">
                          <strong>{item.title}</strong>
                          {item.isPinned && <span className="bookmark-pill">Pin</span>}
                          {item.isFavorite && <span className="bookmark-pill">Favorit</span>}
                          {duplicateCount > 1 && <span className="bookmark-pill warning">Dublette</span>}
                        </div>
                        <span>{item.domain || getDomain(item.url)}</span>
                        {item.description && <p>{item.description}</p>}
                        <div className="bookmark-result-tags">
                          {(item.tags ?? []).map((tag) => <em key={tag}>{tag}</em>)}
                        </div>
                      </div>
                      <div className="bookmark-result-actions">
                        <button className="text-button" onClick={(event) => { event.stopPropagation(); void openBookmark(item); }}>Öffnen</button>
                        <button className="text-button" onClick={(event) => { event.stopPropagation(); startEdit(item); }}>Bearbeiten</button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <aside className="bookmark-detail-panel">
            <div className="bookmark-panel-tabs">
              <button className={!form.id && !activeItem ? 'active' : ''} onClick={() => startCreate('bookmark')}>Neu</button>
              <button className={Boolean(activeItem) && !form.id ? 'active' : ''} onClick={() => activeItem && setForm(emptyForm)}>Details</button>
              <button className={Boolean(form.id) ? 'active' : ''} onClick={() => activeItem && startEdit(activeItem)}>Editor</button>
            </div>

            {(form.id || !activeItem) ? (
              <div className="bookmark-editor">
                <h2>{form.id ? (form.itemType === 'FOLDER' ? 'Ordner bearbeiten' : 'Lesezeichen bearbeiten') : form.itemType === 'FOLDER' ? 'Ordner anlegen' : 'Lesezeichen anlegen'}</h2>
                <select className="input" value={form.itemType} onChange={(event) => setForm((current) => ({ ...current, itemType: event.target.value as 'BOOKMARK' | 'FOLDER' }))}>
                  <option value="BOOKMARK">Lesezeichen</option>
                  <option value="FOLDER">Ordner</option>
                </select>
                <input className="input" value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="Titel" />
                {form.itemType === 'BOOKMARK' && (
                  <input className="input" value={form.url} onChange={(event) => setForm((current) => ({ ...current, url: event.target.value }))} placeholder="https://..." />
                )}
                <select className="input" value={form.parentId} onChange={(event) => setForm((current) => ({ ...current, parentId: event.target.value }))}>
                  <option value="">Hauptebene</option>
                  {folders.filter((folder) => folder.id !== form.id).map((folder) => (
                    <option key={folder.id} value={folder.id}>{folder.title}</option>
                  ))}
                </select>
                <input className="input" value={form.tagsText} onChange={(event) => setForm((current) => ({ ...current, tagsText: event.target.value }))} placeholder="Tags, durch Komma getrennt" />
                <input className="input" value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))} placeholder="Sammlung/Kategorie" />
                <textarea className="input" value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} placeholder="Beschreibung" />
                <textarea className="input bookmark-notes-field" value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Notizen" />
                <div className="bookmark-editor-checks">
                  <label><input type="checkbox" checked={form.isFavorite} onChange={(event) => setForm((current) => ({ ...current, isFavorite: event.target.checked }))} /> Favorit</label>
                  <label><input type="checkbox" checked={form.isPinned} onChange={(event) => setForm((current) => ({ ...current, isPinned: event.target.checked }))} /> Angepinnt</label>
                  <label><input type="checkbox" checked={form.showInToolbar} onChange={(event) => setForm((current) => ({ ...current, showInToolbar: event.target.checked }))} /> Toolbar</label>
                  <label><input type="checkbox" checked={form.isArchived} onChange={(event) => setForm((current) => ({ ...current, isArchived: event.target.checked }))} /> Archiv</label>
                </div>
                <div className="bookmark-editor-actions">
                  <button className="btn btn-primary" onClick={saveForm} disabled={busy}>Speichern</button>
                  <button className="btn btn-secondary" onClick={() => setForm(emptyForm)}>Abbrechen</button>
                </div>
              </div>
            ) : activeItem ? (
              <div className="bookmark-detail">
                {activeItem.faviconUrl ? <img src={activeItem.faviconUrl} alt="" className="bookmark-detail-icon" /> : <span className="bookmark-detail-icon fallback">{getInitials(activeItem.title)}</span>}
                <h2>{activeItem.title}</h2>
                <a href={activeItem.url ?? '#'} target="_blank" rel="noreferrer">{activeItem.url}</a>
                <div className="bookmark-detail-actions">
                  <button className="btn btn-primary" onClick={() => void openBookmark(activeItem)}>Öffnen</button>
                  <button className="btn btn-secondary" onClick={() => startEdit(activeItem)}>Bearbeiten</button>
                </div>
                <div className="profile-detail-list">
                  <div><span>Domain</span><strong>{activeItem.domain || getDomain(activeItem.url)}</strong></div>
                  <div><span>Status</span><strong>{activeItem.linkStatus}</strong></div>
                  <div><span>Erstellt</span><strong>{new Date(activeItem.createdAt).toLocaleDateString('de-DE')}</strong></div>
                  <div><span>Aktualisiert</span><strong>{new Date(activeItem.updatedAt).toLocaleDateString('de-DE')}</strong></div>
                </div>
                {activeItem.description && <p className="bookmark-detail-text">{activeItem.description}</p>}
                {activeItem.notes && <p className="bookmark-detail-text">{activeItem.notes}</p>}
                <div className="bookmark-result-tags">{(activeItem.tags ?? []).map((tag) => <em key={tag}>{tag}</em>)}</div>
                <div className="bookmark-detail-actions">
                  <button className="text-button" onClick={() => void updateItem(activeItem, { isFavorite: !activeItem.isFavorite })}>{activeItem.isFavorite ? 'Favorit entfernen' : 'Favorisieren'}</button>
                  <button className="text-button" onClick={() => void updateItem(activeItem, { isArchived: !activeItem.isArchived })}>{activeItem.isArchived ? 'Wiederherstellen' : 'Archivieren'}</button>
                  <button className="text-button danger" onClick={() => void deleteItem(activeItem)}>Löschen</button>
                </div>
              </div>
            ) : null}

            <div className="bookmark-import-export">
              <h3>Import / Export</h3>
              <textarea className="input" value={importText} onChange={(event) => setImportText(event.target.value)} placeholder="Browser-Bookmark-HTML hier einfügen" />
              <button className="btn btn-secondary" onClick={importHtml} disabled={busy}>HTML importieren</button>
              <div className="bookmark-export-actions">
                <button className="text-button" onClick={exportHtml}>HTML</button>
                <button className="text-button" onClick={exportJson}>JSON</button>
                <button className="text-button" onClick={exportCsv}>CSV</button>
              </div>
            </div>
          </aside>
        </section>
      </main>
    </div>
  );
}
