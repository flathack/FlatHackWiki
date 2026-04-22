import React, { useMemo, useState } from 'react';
import type { BookmarkItem, BookmarkState } from '../../api/client';

type BookmarkPayload = {
  itemType?: 'BOOKMARK' | 'FOLDER';
  parentId?: string | null;
  title: string;
  url?: string | null;
  description?: string | null;
  category?: string | null;
  faviconUrl?: string | null;
  isFavorite?: boolean;
  showInToolbar?: boolean;
};

type BookmarkUpdatePayload = Partial<BookmarkItem>;

type ImportMode = 'append' | 'replace';

function flattenBookmarks(nodes: BookmarkItem[]): BookmarkItem[] {
  return nodes.flatMap((node) => [node, ...flattenBookmarks(node.children)]);
}

function reorderPayloadForSiblingMove(siblings: BookmarkItem[], itemId: string, direction: -1 | 1) {
  const index = siblings.findIndex((item) => item.id === itemId);
  const targetIndex = index + direction;
  if (index < 0 || targetIndex < 0 || targetIndex >= siblings.length) {
    return null;
  }

  const next = [...siblings];
  const [moved] = next.splice(index, 1);
  next.splice(targetIndex, 0, moved);

  return next.map((item, sortOrder) => ({
    id: item.id,
    parentId: item.parentId ?? null,
    sortOrder,
    showInToolbar: item.showInToolbar,
  }));
}

function findSiblings(tree: BookmarkItem[], parentId: string | null): BookmarkItem[] {
  if (!parentId) {
    return tree;
  }

  const flattened = flattenBookmarks(tree);
  const parent = flattened.find((item) => item.id === parentId);
  return parent?.children ?? [];
}

function folderOptions(tree: BookmarkItem[], depth = 0): Array<{ id: string; label: string }> {
  return tree.flatMap((item) => {
    if (item.itemType !== 'FOLDER') {
      return [];
    }

    return [
      { id: item.id, label: `${'  '.repeat(depth)}${item.title}` },
      ...folderOptions(item.children, depth + 1),
    ];
  });
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

export function BookmarkBar({
  bookmarks,
  onOpenManager,
}: {
  bookmarks: BookmarkState;
  onOpenManager: () => void;
}) {
  const toolbarItems = bookmarks.toolbar ?? [];

  return (
    <section className="bookmark-bar-shell">
      <div className="bookmark-bar-track">
        {toolbarItems.length === 0 ? (
          <div className="bookmark-bar-empty">Noch keine Einträge in der Lesezeichenleiste.</div>
        ) : (
          toolbarItems.map((item) =>
            item.itemType === 'FOLDER' ? (
              <details key={item.id} className="bookmark-folder">
                <summary className="bookmark-bar-item bookmark-folder-trigger">
                  <span className="bookmark-folder-icon">Ordner</span>
                  <span className="bookmark-item-title">{item.title}</span>
                </summary>
                <div className="bookmark-folder-menu">
                  {item.children.length === 0 ? (
                    <div className="bookmark-folder-empty">Ordner ist leer.</div>
                  ) : (
                    item.children.map((child) =>
                      child.itemType === 'FOLDER' ? (
                        <div key={child.id} className="bookmark-folder-subgroup">
                          <div className="bookmark-folder-subtitle">{child.title}</div>
                          {child.children.map((grandChild) => (
                            <BookmarkBarLink key={grandChild.id} item={grandChild} nested />
                          ))}
                        </div>
                      ) : (
                        <BookmarkBarLink key={child.id} item={child} nested />
                      )
                    )
                  )}
                </div>
              </details>
            ) : (
              <BookmarkBarLink key={item.id} item={item} />
            )
          )
        )}
      </div>
      <button className="bookmark-gear-button" onClick={onOpenManager} aria-label="Lesezeichen verwalten">
        <svg viewBox="0 0 24 24" aria-hidden="true" className="bookmark-gear-icon">
          <path
            d="M10.6 2.7a1 1 0 0 1 2.8 0l.3 1.6a7.9 7.9 0 0 1 1.9.8l1.4-.9a1 1 0 0 1 1.4.4l1.4 2.4a1 1 0 0 1-.3 1.4l-1.3 1a8 8 0 0 1 0 1.7l1.3 1a1 1 0 0 1 .3 1.4l-1.4 2.4a1 1 0 0 1-1.4.4l-1.4-.9a7.9 7.9 0 0 1-1.9.8l-.3 1.6a1 1 0 0 1-1 .8h-2.8a1 1 0 0 1-1-.8l-.3-1.6a7.9 7.9 0 0 1-1.9-.8l-1.4.9a1 1 0 0 1-1.4-.4L2.6 16a1 1 0 0 1 .3-1.4l1.3-1a8 8 0 0 1 0-1.7l-1.3-1A1 1 0 0 1 2.6 9l1.4-2.4a1 1 0 0 1 1.4-.4l1.4.9a7.9 7.9 0 0 1 1.9-.8l.3-1.6ZM12 9.2A2.8 2.8 0 1 0 12 15a2.8 2.8 0 0 0 0-5.7Z"
            fill="currentColor"
          />
        </svg>
      </button>
    </section>
  );
}

function BookmarkBarLink({ item, nested = false }: { item: BookmarkItem; nested?: boolean }) {
  return (
    <a
      href={item.url || '#'}
      target="_blank"
      rel="noreferrer"
      className={`bookmark-bar-item ${nested ? 'bookmark-bar-item-nested' : ''}`}
    >
      {item.faviconUrl ? <img src={item.faviconUrl} alt="" className="bookmark-favicon" /> : <span className="bookmark-favicon bookmark-favicon-fallback">Link</span>}
      <span className="bookmark-item-title">{item.title}</span>
    </a>
  );
}

export function BookmarkManagerDialog({
  open,
  bookmarks,
  onClose,
  onCreate,
  onUpdate,
  onDelete,
  onReorder,
  onImport,
  onExport,
}: {
  open: boolean;
  bookmarks: BookmarkState;
  onClose: () => void;
  onCreate: (payload: BookmarkPayload) => Promise<void>;
  onUpdate: (id: string, payload: BookmarkUpdatePayload) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onReorder: (items: Array<{ id: string; parentId: string | null; sortOrder: number; showInToolbar?: boolean }>) => Promise<void>;
  onImport: (html: string, mode: ImportMode) => Promise<void>;
  onExport: () => Promise<{ fileName: string; html: string }>;
}) {
  const allItems = useMemo(() => flattenBookmarks(bookmarks.tree), [bookmarks.tree]);
  const folders = useMemo(() => folderOptions(bookmarks.tree), [bookmarks.tree]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState('');
  const [feedback, setFeedback] = useState('');
  const [importMode, setImportMode] = useState<ImportMode>('append');
  const [form, setForm] = useState<BookmarkPayload>({
    itemType: 'BOOKMARK',
    parentId: null,
    title: '',
    url: 'https://',
    description: '',
    category: '',
    faviconUrl: '',
    isFavorite: false,
    showInToolbar: true,
  });

  if (!open) {
    return null;
  }

  const resetForm = () => {
    setEditingId(null);
    setForm({
      itemType: 'BOOKMARK',
      parentId: null,
      title: '',
      url: 'https://',
      description: '',
      category: '',
      faviconUrl: '',
      isFavorite: false,
      showInToolbar: true,
    });
  };

  const submit = async () => {
    setBusy('save');
    setFeedback('');
    try {
      if (editingId) {
        await onUpdate(editingId, form);
      } else {
        await onCreate(form);
      }
      resetForm();
      setFeedback('Lesezeichen-Struktur gespeichert.');
    } finally {
      setBusy('');
    }
  };

  const startEdit = (item: BookmarkItem) => {
    setEditingId(item.id);
    setForm({
      itemType: item.itemType,
      parentId: item.parentId ?? null,
      title: item.title,
      url: item.url ?? 'https://',
      description: item.description ?? '',
      category: item.category ?? '',
      faviconUrl: item.faviconUrl ?? '',
      isFavorite: item.isFavorite,
      showInToolbar: item.showInToolbar,
    });
  };

  const moveItem = async (item: BookmarkItem, direction: -1 | 1) => {
    const siblings = findSiblings(bookmarks.tree, item.parentId ?? null);
    const payload = reorderPayloadForSiblingMove(siblings, item.id, direction);
    if (!payload) return;
    setBusy(`move-${item.id}`);
    try {
      await onReorder(payload);
    } finally {
      setBusy('');
    }
  };

  const handleImportFile = async (file?: File | null) => {
    if (!file) return;
    setBusy('import');
    setFeedback('');
    try {
      const html = await file.text();
      await onImport(html, importMode);
      setFeedback('Import erfolgreich abgeschlossen.');
    } finally {
      setBusy('');
    }
  };

  const handleExport = async () => {
    setBusy('export');
    setFeedback('');
    try {
      const exported = await onExport();
      downloadTextFile(exported.fileName, exported.html, 'text/html;charset=utf-8');
      setFeedback('Export wurde heruntergeladen.');
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="dialog-backdrop">
      <div className="dialog-panel large-panel bookmark-manager-dialog">
        <div className="dialog-header">
          <div>
            <div className="dialog-eyebrow">Lesezeichen-Manager</div>
            <h2>Zentrale Verwaltung</h2>
          </div>
          <button className="btn btn-secondary" onClick={onClose}>Schließen</button>
        </div>

        <div className="bookmark-manager-summary">
          <div className="widget-stat-box"><span>Einträge</span><strong>{bookmarks.totalCount}</strong></div>
          <div className="widget-stat-box"><span>Lesezeichen</span><strong>{bookmarks.bookmarkCount}</strong></div>
          <div className="widget-stat-box"><span>Ordner</span><strong>{bookmarks.folderCount}</strong></div>
          <div className="widget-stat-box"><span>Favoriten</span><strong>{bookmarks.favoriteCount}</strong></div>
        </div>

        <div className="dialog-grid bookmark-manager-grid">
          <section className="dialog-card span-2">
            <h3>{editingId ? 'Eintrag bearbeiten' : 'Eintrag anlegen'}</h3>
            <div className="widget-form-grid">
              <select className="input" value={form.itemType || 'BOOKMARK'} onChange={(e) => setForm((current) => ({ ...current, itemType: e.target.value as 'BOOKMARK' | 'FOLDER' }))}>
                <option value="BOOKMARK">Lesezeichen</option>
                <option value="FOLDER">Ordner</option>
              </select>
              <select className="input" value={form.parentId || ''} onChange={(e) => setForm((current) => ({ ...current, parentId: e.target.value || null }))}>
                <option value="">Direkt in der Leiste</option>
                {folders.filter((folder) => folder.id !== editingId).map((folder) => (
                  <option key={folder.id} value={folder.id}>{folder.label}</option>
                ))}
              </select>
              <input className="input" value={form.title} onChange={(e) => setForm((current) => ({ ...current, title: e.target.value }))} placeholder="Titel" />
              {form.itemType !== 'FOLDER' && (
                <input className="input" value={form.url || ''} onChange={(e) => setForm((current) => ({ ...current, url: e.target.value }))} placeholder="https://..." />
              )}
              <input className="input" value={form.category || ''} onChange={(e) => setForm((current) => ({ ...current, category: e.target.value }))} placeholder="Kategorie" />
              <input className="input" value={form.faviconUrl || ''} onChange={(e) => setForm((current) => ({ ...current, faviconUrl: e.target.value }))} placeholder="Optionale Favicon-URL" />
            </div>
            <textarea className="input widget-notes" value={form.description || ''} onChange={(e) => setForm((current) => ({ ...current, description: e.target.value }))} placeholder="Beschreibung" />
            <div className="option-grid">
              <label className="checkbox-row"><input type="checkbox" checked={Boolean(form.showInToolbar)} onChange={(e) => setForm((current) => ({ ...current, showInToolbar: e.target.checked }))} /><span>In Lesezeichenleiste anzeigen</span></label>
              <label className="checkbox-row"><input type="checkbox" checked={Boolean(form.isFavorite)} onChange={(e) => setForm((current) => ({ ...current, isFavorite: e.target.checked }))} /><span>Als Favorit markieren</span></label>
            </div>
            {feedback && <div className="widget-message widget-message-success">{feedback}</div>}
            <div className="widget-toolbar-end">
              {editingId && <button className="btn btn-secondary" onClick={resetForm}>Abbrechen</button>}
              <button className="btn btn-primary" onClick={submit} disabled={busy === 'save'}>{busy === 'save' ? 'Speichert ...' : editingId ? 'Änderung speichern' : 'Eintrag anlegen'}</button>
            </div>
          </section>

          <section className="dialog-card">
            <h3>Import / Export</h3>
            <div className="widget-stack">
              <select className="input" value={importMode} onChange={(e) => setImportMode(e.target.value as ImportMode)}>
                <option value="append">Import anhängen</option>
                <option value="replace">Bestehende Struktur ersetzen</option>
              </select>
              <label className="btn btn-secondary bookmark-upload-button">
                HTML-Datei importieren
                <input type="file" accept=".html,text/html" className="hidden" onChange={(e) => handleImportFile(e.target.files?.[0] || null)} />
              </label>
              <button className="btn btn-primary" onClick={handleExport} disabled={busy === 'export'}>
                {busy === 'export' ? 'Exportiert ...' : 'HTML exportieren'}
              </button>
            </div>
          </section>

          <section className="dialog-card span-2">
            <h3>Struktur</h3>
            <div className="bookmark-tree-list">
              {bookmarks.tree.length === 0 ? <div className="widget-message">Noch keine Lesezeichen vorhanden.</div> : bookmarks.tree.map((item) => (
                <BookmarkTreeRow key={item.id} item={item} depth={0} busy={busy} onEdit={startEdit} onDelete={onDelete} onMove={moveItem} />
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function BookmarkTreeRow({
  item,
  depth,
  busy,
  onEdit,
  onDelete,
  onMove,
}: {
  item: BookmarkItem;
  depth: number;
  busy: string;
  onEdit: (item: BookmarkItem) => void;
  onDelete: (id: string) => Promise<void>;
  onMove: (item: BookmarkItem, direction: -1 | 1) => Promise<void>;
}) {
  return (
    <div className="bookmark-tree-node">
      <div className="bookmark-tree-row" style={{ paddingLeft: `${depth * 18}px` }}>
        <div className="bookmark-tree-main">
          <span className={`bookmark-tree-type ${item.itemType === 'FOLDER' ? 'folder' : 'link'}`}>
            {item.itemType === 'FOLDER' ? 'Ordner' : 'Link'}
          </span>
          <strong>{item.title}</strong>
          {item.itemType === 'BOOKMARK' && item.url && <span>{item.url}</span>}
        </div>
        <div className="widget-inline-actions">
          {item.itemType === 'BOOKMARK' && item.url && <a href={item.url} target="_blank" rel="noreferrer" className="text-button">Öffnen</a>}
          <button className="text-button" onClick={() => onMove(item, -1)} disabled={busy === `move-${item.id}`}>Hoch</button>
          <button className="text-button" onClick={() => onMove(item, 1)} disabled={busy === `move-${item.id}`}>Runter</button>
          <button className="text-button" onClick={() => onEdit(item)}>Bearbeiten</button>
          <button className="text-button danger" onClick={() => onDelete(item.id)}>Löschen</button>
        </div>
      </div>
      {item.children.length > 0 && (
        <div className="bookmark-tree-children">
          {item.children.map((child) => (
            <BookmarkTreeRow key={child.id} item={child} depth={depth + 1} busy={busy} onEdit={onEdit} onDelete={onDelete} onMove={onMove} />
          ))}
        </div>
      )}
    </div>
  );
}

