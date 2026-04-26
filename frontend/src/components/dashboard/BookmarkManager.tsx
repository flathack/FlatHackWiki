import React, { useEffect, useMemo, useRef, useState } from 'react';
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
type ContextMenuState = {
  item: BookmarkItem;
  x: number;
  y: number;
} | null;
type ReorderPayloadItem = {
  id: string;
  parentId: string | null;
  sortOrder: number;
  showInToolbar?: boolean;
};
type DragState = {
  itemId: string;
} | null;
type DropIndicator = {
  parentId: string | null;
  index: number;
  mode: 'slot' | 'folder';
} | null;

function flattenBookmarks(nodes: BookmarkItem[]): BookmarkItem[] {
  return nodes.flatMap((node) => [node, ...flattenBookmarks(node.children)]);
}

function cloneBookmark(node: BookmarkItem): BookmarkItem {
  return {
    ...node,
    children: node.children.map(cloneBookmark),
  };
}

function cloneTree(nodes: BookmarkItem[]) {
  return nodes.map(cloneBookmark);
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

function filterBookmarkTree(nodes: BookmarkItem[], query: string): BookmarkItem[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return nodes;
  }

  return nodes.flatMap((node) => {
    const children = filterBookmarkTree(node.children, normalized);
    const haystack = [node.title, node.url, node.description, node.category].join(' ').toLowerCase();
    if (haystack.includes(normalized) || children.length > 0) {
      return [{ ...node, children }];
    }
    return [];
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

function removeNode(nodes: BookmarkItem[], itemId: string): { next: BookmarkItem[]; removed: BookmarkItem | null } {
  const next: BookmarkItem[] = [];

  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (node.id === itemId) {
      return {
        next: [...next, ...nodes.slice(index + 1)],
        removed: cloneBookmark(node),
      };
    }

    const childResult = removeNode(node.children, itemId);
    if (childResult.removed) {
      next.push({
        ...node,
        children: childResult.next,
      });
      next.push(...nodes.slice(index + 1));
      return { next, removed: childResult.removed };
    }

    next.push(node);
  }

  return { next: nodes, removed: null };
}

function insertNode(
  nodes: BookmarkItem[],
  parentId: string | null,
  index: number,
  item: BookmarkItem
): BookmarkItem[] {
  if (!parentId) {
    const next = [...nodes];
    next.splice(Math.max(0, Math.min(index, next.length)), 0, item);
    return next;
  }

  return nodes.map((node) => {
    if (node.id === parentId) {
      const nextChildren = [...node.children];
      nextChildren.splice(Math.max(0, Math.min(index, nextChildren.length)), 0, item);
      return {
        ...node,
        children: nextChildren,
      };
    }

    return {
      ...node,
      children: insertNode(node.children, parentId, index, item),
    };
  });
}

function findNode(nodes: BookmarkItem[], itemId: string): BookmarkItem | null {
  for (const node of nodes) {
    if (node.id === itemId) {
      return node;
    }

    const child = findNode(node.children, itemId);
    if (child) {
      return child;
    }
  }

  return null;
}

function containsNode(node: BookmarkItem, targetId: string): boolean {
  if (node.id === targetId) {
    return true;
  }

  return node.children.some((child) => containsNode(child, targetId));
}

function buildReorderPayload(nodes: BookmarkItem[], parentId: string | null = null): ReorderPayloadItem[] {
  return nodes.flatMap((node, sortOrder) => {
    const current: ReorderPayloadItem = {
      id: node.id,
      parentId,
      sortOrder,
      showInToolbar: parentId === null ? Boolean(node.showInToolbar) : false,
    };

    return [current, ...buildReorderPayload(node.children, node.id)];
  });
}

function moveBookmarkTree(
  sourceTree: BookmarkItem[],
  draggedId: string,
  targetParentId: string | null,
  targetIndex: number
): BookmarkItem[] | null {
  const tree = cloneTree(sourceTree);
  const draggedNode = findNode(tree, draggedId);
  if (!draggedNode) {
    return null;
  }

  if (targetParentId === draggedId) {
    return null;
  }

  if (draggedNode.itemType === 'FOLDER' && targetParentId) {
    const targetParentNode = findNode(tree, targetParentId);
    if (targetParentNode && containsNode(draggedNode, targetParentId)) {
      return null;
    }
  }

  const removal = removeNode(tree, draggedId);
  if (!removal.removed) {
    return null;
  }

  const movedNode: BookmarkItem = {
    ...removal.removed,
    parentId: targetParentId,
    showInToolbar: targetParentId === null,
  };

  return insertNode(removal.next, targetParentId, targetIndex, movedNode);
}

function folderEntryCount(item: BookmarkItem) {
  return item.children.length;
}

function getDropIndicatorKey(indicator: DropIndicator) {
  if (!indicator) return '';
  return `${indicator.parentId ?? 'root'}:${indicator.index}:${indicator.mode}`;
}

function BookmarkDropSlot({
  parentId,
  index,
  active,
  onDragOver,
  onDrop,
  compact = false,
}: {
  parentId: string | null;
  index: number;
  active: boolean;
  onDragOver: (parentId: string | null, index: number, mode: 'slot') => void;
  onDrop: (parentId: string | null, index: number) => void;
  compact?: boolean;
}) {
  return (
    <div
      className={`bookmark-drop-slot ${compact ? 'bookmark-drop-slot-compact' : ''} ${active ? 'active' : ''}`}
      onDragOver={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onDragOver(parentId, index, 'slot');
      }}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onDrop(parentId, index);
      }}
    />
  );
}

function BookmarkFolderContents({
  items,
  parentId,
  dragState,
  dropIndicator,
  onDragStart,
  onDragEnd,
  onDragOverSlot,
  onDropSlot,
  onDropIntoFolder,
  onContextMenu,
}: {
  items: BookmarkItem[];
  parentId: string | null;
  dragState: DragState;
  dropIndicator: DropIndicator;
  onDragStart: (item: BookmarkItem) => void;
  onDragEnd: () => void;
  onDragOverSlot: (parentId: string | null, index: number, mode: 'slot' | 'folder') => void;
  onDropSlot: (parentId: string | null, index: number) => void;
  onDropIntoFolder: (folder: BookmarkItem) => void;
  onContextMenu: (event: React.MouseEvent, item: BookmarkItem) => void;
}) {
  return (
    <div className="bookmark-folder-list">
      <BookmarkDropSlot
        parentId={parentId}
        index={0}
        compact
        active={getDropIndicatorKey(dropIndicator) === getDropIndicatorKey({ parentId, index: 0, mode: 'slot' })}
        onDragOver={onDragOverSlot}
        onDrop={onDropSlot}
      />
      {items.map((child, index) => (
        <React.Fragment key={child.id}>
          {child.itemType === 'FOLDER' ? (
            <div className="bookmark-folder-subgroup">
              <button
                type="button"
                className={`bookmark-folder-entry ${dragState?.itemId === child.id ? 'dragging' : ''}`}
                draggable
                onDragStart={() => onDragStart(child)}
                onDragEnd={onDragEnd}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onDragOverSlot(child.id, folderEntryCount(child), 'folder');
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onDropIntoFolder(child);
                }}
                onContextMenu={(event) => onContextMenu(event, child)}
              >
                <span className="bookmark-folder-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" className="bookmark-folder-icon-svg">
                    <path
                      d="M3.75 6.75A2.25 2.25 0 0 1 6 4.5h4.08c.6 0 1.16.24 1.58.66l1.18 1.18c.14.14.33.22.53.22H18A2.25 2.25 0 0 1 20.25 8.8v8.45A2.25 2.25 0 0 1 18 19.5H6a2.25 2.25 0 0 1-2.25-2.25V6.75Z"
                      fill="currentColor"
                    />
                  </svg>
                </span>
                <span className="bookmark-item-title">{child.title}</span>
              </button>
              <BookmarkFolderContents
                items={child.children}
                parentId={child.id}
                dragState={dragState}
                dropIndicator={dropIndicator}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                onDragOverSlot={onDragOverSlot}
                onDropSlot={onDropSlot}
                onDropIntoFolder={onDropIntoFolder}
                onContextMenu={onContextMenu}
              />
            </div>
          ) : (
            <BookmarkBarLink
              item={child}
              nested
              draggable
              isDragging={dragState?.itemId === child.id}
              onDragStart={() => onDragStart(child)}
              onDragEnd={onDragEnd}
              onContextMenu={onContextMenu}
            />
          )}
          <BookmarkDropSlot
            parentId={parentId}
            index={index + 1}
            compact
            active={getDropIndicatorKey(dropIndicator) === getDropIndicatorKey({ parentId, index: index + 1, mode: 'slot' })}
            onDragOver={onDragOverSlot}
            onDrop={onDropSlot}
          />
        </React.Fragment>
      ))}
    </div>
  );
}

export function BookmarkBar({
  bookmarks,
  onOpenManager,
  onEditItem,
  onDeleteItem,
  onReorder,
}: {
  bookmarks: BookmarkState;
  onOpenManager: () => void;
  onEditItem: (item: BookmarkItem) => void;
  onDeleteItem: (item: BookmarkItem) => Promise<void>;
  onReorder: (items: ReorderPayloadItem[]) => Promise<void>;
}) {
  const toolbarItems = bookmarks.toolbar ?? [];
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const [openFolderId, setOpenFolderId] = useState<string | null>(null);
  const [dragState, setDragState] = useState<DragState>(null);
  const [dropIndicator, setDropIndicator] = useState<DropIndicator>(null);
  const [moveBusy, setMoveBusy] = useState(false);
  const barRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!contextMenu && !openFolderId) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (barRef.current?.contains(target)) {
        return;
      }

      setContextMenu(null);
      setOpenFolderId(null);
    };

    const handleScroll = (event: Event) => {
      const target = event.target as Node | null;
      if (target && barRef.current?.contains(target)) {
        return;
      }

      setContextMenu(null);
      setOpenFolderId(null);
    };

    const closeFloatingUi = () => {
      setContextMenu(null);
      setOpenFolderId(null);
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', closeFloatingUi);

    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', closeFloatingUi);
    };
  }, [contextMenu, openFolderId]);

  const clearDragState = () => {
    setDragState(null);
    setDropIndicator(null);
  };

  const runMove = async (targetParentId: string | null, targetIndex: number) => {
    if (!dragState?.itemId || moveBusy) {
      return;
    }

    const nextTree = moveBookmarkTree(bookmarks.tree, dragState.itemId, targetParentId, targetIndex);
    if (!nextTree) {
      clearDragState();
      return;
    }

    setMoveBusy(true);
    try {
      await onReorder(buildReorderPayload(nextTree));
      setOpenFolderId(targetParentId);
    } finally {
      setMoveBusy(false);
      clearDragState();
    }
  };

  const openContextMenu = (event: React.MouseEvent, item: BookmarkItem) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({
      item,
      x: Math.min(event.clientX, window.innerWidth - 220),
      y: Math.min(event.clientY, window.innerHeight - 220),
    });
  };

  const openBookmark = (item: BookmarkItem, mode: 'current' | 'new') => {
    if (!item.url) return;
    if (mode === 'current') {
      window.location.href = item.url;
      return;
    }
    window.open(item.url, '_blank', 'noopener,noreferrer');
  };

  return (
    <section ref={barRef} className="bookmark-bar-shell">
      <div className="bookmark-bar-track">
        {toolbarItems.length === 0 ? (
          <div
            className={`bookmark-bar-empty-drop ${dragState ? 'active' : ''}`}
            onDragOver={(event) => {
              event.preventDefault();
              setDropIndicator({ parentId: null, index: 0, mode: 'slot' });
            }}
            onDrop={(event) => {
              event.preventDefault();
              void runMove(null, 0);
            }}
          >
            Noch keine Einträge in der Lesezeichenleiste.
          </div>
        ) : (
          <>
            <BookmarkDropSlot
              parentId={null}
              index={0}
              active={getDropIndicatorKey(dropIndicator) === getDropIndicatorKey({ parentId: null, index: 0, mode: 'slot' })}
              onDragOver={(parentId, index) => setDropIndicator({ parentId, index, mode: 'slot' })}
              onDrop={(parentId, index) => {
                void runMove(parentId, index);
              }}
            />
            {toolbarItems.map((item, index) => (
              <React.Fragment key={item.id}>
                {item.itemType === 'FOLDER' ? (
                  <div className="bookmark-folder" onContextMenu={(event) => openContextMenu(event, item)}>
                    <button
                      type="button"
                      className={`bookmark-bar-item bookmark-folder-trigger ${dragState?.itemId === item.id ? 'dragging' : ''} ${
                        getDropIndicatorKey(dropIndicator) === getDropIndicatorKey({ parentId: item.id, index: folderEntryCount(item), mode: 'folder' })
                          ? 'drop-target'
                          : ''
                      }`}
                      title={item.title}
                      aria-expanded={openFolderId === item.id}
                      draggable
                      onDragStart={() => setDragState({ itemId: item.id })}
                      onDragEnd={clearDragState}
                      onDragOver={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setDropIndicator({ parentId: item.id, index: folderEntryCount(item), mode: 'folder' });
                        setOpenFolderId(item.id);
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        void runMove(item.id, folderEntryCount(item));
                      }}
                      onClick={(event) => {
                        event.stopPropagation();
                        setContextMenu(null);
                        setOpenFolderId((current) => (current === item.id ? null : item.id));
                      }}
                    >
                      <span className="bookmark-folder-icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" className="bookmark-folder-icon-svg">
                          <path
                            d="M3.75 6.75A2.25 2.25 0 0 1 6 4.5h4.08c.6 0 1.16.24 1.58.66l1.18 1.18c.14.14.33.22.53.22H18A2.25 2.25 0 0 1 20.25 8.8v8.45A2.25 2.25 0 0 1 18 19.5H6a2.25 2.25 0 0 1-2.25-2.25V6.75Z"
                            fill="currentColor"
                          />
                        </svg>
                      </span>
                      <span className="bookmark-item-title">{item.title}</span>
                    </button>
                    {openFolderId === item.id && (
                      <div className="bookmark-folder-menu">
                        {item.children.length === 0 ? (
                          <div className="bookmark-folder-empty">Ordner ist leer.</div>
                        ) : (
                          <BookmarkFolderContents
                            items={item.children}
                            parentId={item.id}
                            dragState={dragState}
                            dropIndicator={dropIndicator}
                            onDragStart={(child) => setDragState({ itemId: child.id })}
                            onDragEnd={clearDragState}
                            onDragOverSlot={(parentId, slotIndex, mode) => {
                              setDropIndicator({ parentId, index: slotIndex, mode });
                            }}
                            onDropSlot={(parentId, slotIndex) => {
                              void runMove(parentId, slotIndex);
                            }}
                            onDropIntoFolder={(folder) => {
                              void runMove(folder.id, folderEntryCount(folder));
                            }}
                            onContextMenu={openContextMenu}
                          />
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <BookmarkBarLink
                    item={item}
                    draggable
                    isDragging={dragState?.itemId === item.id}
                    onDragStart={() => setDragState({ itemId: item.id })}
                    onDragEnd={clearDragState}
                    onContextMenu={openContextMenu}
                  />
                )}
                <BookmarkDropSlot
                  parentId={null}
                  index={index + 1}
                  active={getDropIndicatorKey(dropIndicator) === getDropIndicatorKey({ parentId: null, index: index + 1, mode: 'slot' })}
                  onDragOver={(parentId, slotIndex) => setDropIndicator({ parentId, index: slotIndex, mode: 'slot' })}
                  onDrop={(parentId, slotIndex) => {
                    void runMove(parentId, slotIndex);
                  }}
                />
              </React.Fragment>
            ))}
          </>
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
      {contextMenu && (
        <div className="bookmark-context-menu" style={{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }}>
          {contextMenu.item.itemType === 'BOOKMARK' && contextMenu.item.url && (
            <>
              <button
                className="bookmark-context-action"
                onClick={() => {
                  openBookmark(contextMenu.item, 'new');
                  setContextMenu(null);
                }}
              >
                Im neuen Tab öffnen
              </button>
              <button
                className="bookmark-context-action"
                onClick={() => {
                  openBookmark(contextMenu.item, 'current');
                  setContextMenu(null);
                }}
              >
                Im aktuellen Tab öffnen
              </button>
            </>
          )}
          <button
            className="bookmark-context-action"
            onClick={() => {
              onEditItem(contextMenu.item);
              setContextMenu(null);
            }}
          >
            Bearbeiten
          </button>
          <button
            className="bookmark-context-action danger"
            onClick={async () => {
              await onDeleteItem(contextMenu.item);
              setContextMenu(null);
            }}
          >
            Löschen
          </button>
        </div>
      )}
    </section>
  );
}

function BookmarkBarLink({
  item,
  nested = false,
  draggable = false,
  isDragging = false,
  onDragStart,
  onDragEnd,
  onContextMenu,
}: {
  item: BookmarkItem;
  nested?: boolean;
  draggable?: boolean;
  isDragging?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onContextMenu: (event: React.MouseEvent, item: BookmarkItem) => void;
}) {
  return (
    <a
      href={item.url || '#'}
      target="_blank"
      rel="noreferrer"
      draggable={draggable}
      className={`bookmark-bar-item ${nested ? 'bookmark-bar-item-nested' : ''} ${isDragging ? 'dragging' : ''}`}
      title={item.title}
      onDragStart={() => onDragStart?.()}
      onDragEnd={() => onDragEnd?.()}
      onContextMenu={(event) => onContextMenu(event, item)}
    >
      {item.faviconUrl ? (
        <img src={item.faviconUrl} alt="" className="bookmark-favicon" />
      ) : (
        <span className="bookmark-favicon bookmark-favicon-fallback">Link</span>
      )}
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
  initialEditItem,
}: {
  open: boolean;
  bookmarks: BookmarkState;
  onClose: () => void;
  onCreate: (payload: BookmarkPayload) => Promise<void>;
  onUpdate: (id: string, payload: BookmarkUpdatePayload) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onReorder: (items: ReorderPayloadItem[]) => Promise<void>;
  onImport: (html: string, mode: ImportMode) => Promise<void>;
  onExport: () => Promise<{ fileName: string; html: string }>;
  initialEditItem?: BookmarkItem | null;
}) {
  const folders = useMemo(() => folderOptions(bookmarks.tree), [bookmarks.tree]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState('');
  const [feedback, setFeedback] = useState('');
  const [importError, setImportError] = useState('');
  const [importMode, setImportMode] = useState<ImportMode>('append');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importText, setImportText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
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

  useEffect(() => {
    if (!initialEditItem) return;
    setEditingId(initialEditItem.id);
    setForm({
      itemType: initialEditItem.itemType,
      parentId: initialEditItem.parentId ?? null,
      title: initialEditItem.title,
      url: initialEditItem.url ?? 'https://',
      description: initialEditItem.description ?? '',
      category: initialEditItem.category ?? '',
      faviconUrl: initialEditItem.faviconUrl ?? '',
      isFavorite: initialEditItem.isFavorite,
      showInToolbar: initialEditItem.showInToolbar,
    });
  }, [initialEditItem]);

  if (!open) {
    return null;
  }

  const filteredTree = filterBookmarkTree(bookmarks.tree, searchQuery);

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

  const handleImportFile = (file?: File | null) => {
    setImportError('');
    setFeedback('');
    setImportFile(file ?? null);
  };

  const handleImportSubmit = async () => {
    const htmlFromTextarea = importText.trim();
    if (!importFile && !htmlFromTextarea) {
      setImportError('Bitte wähle eine HTML-Datei aus oder füge den Lesezeichen-HTML-Inhalt ein.');
      return;
    }

    setBusy('import');
    setImportError('');
    setFeedback('');

    try {
      const html = htmlFromTextarea || (await importFile!.text());
      await onImport(html, importMode);
      setImportFile(null);
      setImportText('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      setFeedback('Import erfolgreich abgeschlossen.');
    } catch (error: any) {
      setImportError(error?.response?.data?.error?.message || error?.message || 'Import konnte nicht durchgeführt werden.');
    } finally {
      setBusy('');
    }
  };

  const handleExport = async () => {
    setBusy('export');
    setFeedback('');
    setImportError('');
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
          <section className="dialog-card span-2 bookmark-manager-panel">
            <div className="bookmark-manager-toolbar">
              <div>
                <h3>{editingId ? 'Eintrag bearbeiten' : 'Eintrag anlegen'}</h3>
                <p className="widget-shell-subtitle">Leiste, Ordner und Favoriten an einer Stelle verwalten.</p>
              </div>
              <input
                className="input bookmark-manager-search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Lesezeichen und Ordner durchsuchen"
              />
            </div>
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

          <section className="dialog-card bookmark-manager-panel bookmark-manager-panel-sticky">
            <h3>Import / Export</h3>
            <div className="widget-stack">
              <select className="input" value={importMode} onChange={(e) => setImportMode(e.target.value as ImportMode)}>
                <option value="append">Import anhängen</option>
                <option value="replace">Bestehende Struktur ersetzen</option>
              </select>
              <input
                ref={fileInputRef}
                type="file"
                accept=".html,text/html"
                className="hidden"
                onChange={(e) => handleImportFile(e.target.files?.[0] || null)}
              />
              <button className="btn btn-secondary" type="button" onClick={() => fileInputRef.current?.click()}>
                HTML-Datei auswählen
              </button>
              <div className="widget-message">
                {importFile ? `Ausgewählt: ${importFile.name}` : 'Noch keine HTML-Datei ausgewählt.'}
              </div>
              <textarea
                className="input widget-notes"
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder="Optional: Browser-Lesezeichen-HTML hier direkt einfügen"
              />
              {importError && <div className="widget-message widget-message-error">{importError}</div>}
              <button className="btn btn-primary" onClick={handleImportSubmit} disabled={busy === 'import'}>
                {busy === 'import' ? 'Importiert ...' : 'Importieren'}
              </button>
              <button className="btn btn-primary" onClick={handleExport} disabled={busy === 'export'}>
                {busy === 'export' ? 'Exportiert ...' : 'HTML exportieren'}
              </button>
            </div>
          </section>

          <section className="dialog-card span-2 bookmark-manager-panel">
            <div className="bookmark-manager-toolbar">
              <div>
                <h3>Struktur</h3>
                <p className="widget-shell-subtitle">Per Suche filtern, per Buttons fein sortieren, per Leiste schnell öffnen.</p>
              </div>
            </div>
            <div className="bookmark-tree-list">
              {filteredTree.length === 0 ? <div className="widget-message">Keine passenden Lesezeichen gefunden.</div> : filteredTree.map((item) => (
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

