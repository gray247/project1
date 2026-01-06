(function (global) {
  let sharedClipMenu = null;
  let clipMenuHandlersBound = false;

  const hideSharedClipMenu = () => {
    if (!sharedClipMenu) return;
    sharedClipMenu.style.display = 'none';
    sharedClipMenu.removeAttribute('data-clip-id');
  };

  const handleSharedClipMenuKey = (event) => {
    if (event.key === 'Escape') {
      hideSharedClipMenu();
    }
  };

  const ensureSharedClipMenu = (doc) => {
    if (!doc) return null;
    if (!sharedClipMenu) {
      sharedClipMenu = doc.createElement('div');
      sharedClipMenu.className = 'context-menu';
      sharedClipMenu.innerHTML = `
        <ul>
          <li data-action="rename">Rename clip</li>
          <li data-action="icon">Change icon</li>
          <li data-action="color">Change color</li>
          <li data-action="delete" class="danger">Delete clip</li>
        </ul>
      `;
      doc.body?.appendChild(sharedClipMenu);
    }
    if (!clipMenuHandlersBound) {
      doc.addEventListener('click', hideSharedClipMenu);
      doc.addEventListener('scroll', hideSharedClipMenu, true);
      doc.addEventListener('keydown', handleSharedClipMenuKey);
      clipMenuHandlersBound = true;
    }
    return sharedClipMenu;
  };

  function initClips({ state = {}, dom = {} } = {}) {
    const app = state;
    const doc = global.document;
    const api = global.api || {};
    const clipListEl = dom.clipListContainer || (doc ? doc.getElementById('clipList') : null);
    const getRendererApi = () => global.SnipRenderer || {};
    const callRefreshClipList = () => getRendererApi().refreshClipList?.();
    const callRefreshEditor = () => getRendererApi().refreshEditor?.();
    const clipSelectedListeners = [];
    let editorApi = null;
    let modalsApi = null;
    let dragSourceId = null;

    const triggerGlobalRefresh = () => {
      modalsApi?.refreshData?.();
    };

    const createClipIconElement = (clip) => {
      if (!doc) return null;
      const rawIcon = typeof clip?.icon === "string" ? clip.icon.trim() : "";
      const choice = modalsApi?.findIconChoice?.(rawIcon) || null;
      if (!choice && !rawIcon) return null;
      const glyph = modalsApi?.createIconGlyph?.(choice || rawIcon);
      if (!glyph) return null;
      if (!glyph.classList?.contains("icon-choice__glyph")) {
        glyph.classList?.add("icon-choice__glyph");
      }
      const wrapper = doc.createElement("span");
      wrapper.className = "clip-icon";
      wrapper.appendChild(glyph);
      return wrapper;
    };

    const getActiveSectionId = () => app.activeTabId || 'all';

    const setEditorApi = (apiRef) => {
      editorApi = apiRef;
    };

    const setModalsApi = (apiRef) => {
      modalsApi = apiRef;
    };

    const onClipSelected = (callback) => {
      if (typeof callback === 'function') clipSelectedListeners.push(callback);
    };

    const notifySelection = (clip, meta = {}) => {
      clipSelectedListeners.forEach((cb) => {
        try {
          cb(clip, meta);
        } catch (err) {
          console.warn('Clip selection handler failed', err);
        }
      });
    };

    const getSelectedClipIds = () => {
      if (!(app.selectedClipIds instanceof Set)) {
        app.selectedClipIds = new Set();
      }
      return app.selectedClipIds;
    };

    const clearSelectedClipIds = () => {
      const selected = getSelectedClipIds();
      if (selected.size) selected.clear();
    };

    const toggleSelectedClipId = (clipId) => {
      if (!clipId) return;
      const selected = getSelectedClipIds();
      if (selected.has(clipId)) {
        selected.delete(clipId);
      } else {
        selected.add(clipId);
      }
    };

    const reorderClips = (sourceId, targetId) => {
      const clips = app.clips || [];
      const sourceIndex = clips.findIndex((clip) => clip.id === sourceId);
      if (sourceIndex === -1) return;
      const targetIndex = clips.findIndex((clip) => clip.id === targetId);
      const [moved] = clips.splice(sourceIndex, 1);
      if (targetIndex === -1) {
        clips.push(moved);
      } else {
        clips.splice(targetIndex, 0, moved);
      }
    };

    const persistClip = async (clip) => {
      if (!clip) return;
      try {
        const saved = await (api.saveClip ? api.saveClip(clip, { mirror: false }) : Promise.resolve(clip));
        const normalized = saved || clip;
        const existingIndex = (app.clips || []).findIndex((item) => item.id === normalized.id);
        if (existingIndex !== -1) {
          app.clips[existingIndex] = normalized;
        } else {
          app.clips.push(normalized);
        }
        app.currentClipId = normalized.id;
        renderClipList();
        editorApi?.loadClipIntoEditor?.(normalized);
        callRefreshClipList();
        if (app.currentClipId === normalized.id) {
          callRefreshEditor();
        }
        triggerGlobalRefresh();
      } catch (err) {
        console.error('Persist clip failed', err);
      }
    };

    const deleteClip = async (clip) => {
      if (!clip) return;
      const question = `Delete clip "${clip.title || clip.id}"?`;
      const confirmed = await modalsApi?.openConfirmModal?.(question);
      if (!confirmed) return;
      const renderer = getRendererApi();
      const locked = renderer?.isSectionLocked?.(clip.sectionId || getActiveSectionId());
      if (locked) {
        global.SnipToast?.show?.('Tab is locked: cannot delete clips.');
        return;
      }
      try {
        const result = await (api.deleteClip ? api.deleteClip(clip.id) : Promise.resolve({ ok: true }));
        if (result?.blocked) {
          global.alert?.('Clip is in a locked section.');
          return;
        }
        const selected = getSelectedClipIds();
        if (selected.size) selected.delete(clip.id);
        app.clips = (app.clips || []).filter((item) => item.id !== clip.id);
        if (app.currentClipId === clip.id) {
          app.currentClipId = app.clips[0]?.id || null;
        }
        renderClipList();
        const nextClip = app.clips.find((item) => item.id === app.currentClipId) || null;
        editorApi?.loadClipIntoEditor?.(nextClip);
        callRefreshClipList();
        callRefreshEditor();
        triggerGlobalRefresh();
      } catch (err) {
        console.error('Delete clip failed', err);
      }
    };

    const clipActions = {
      rename: (clip) => {
        modalsApi?.openRenameClipModal?.(clip, async (value) => {
          if (!value) return;
          clip.title = value;
          await persistClip(clip);
        });
      },
      icon: (clip) => {
        modalsApi?.openChangeClipIconModal?.(clip, {
          onSave: async (icon) => {
            clip.icon = icon || '';
            await persistClip(clip);
          },
        });
      },
      color: (clip) => {
        modalsApi?.openChangeClipColorModal?.(clip, {
          onSave: async (color) => {
            clip.color = color || '';
            await persistClip(clip);
          },
        });
      },
      delete: (clip) => {
        const renderer = getRendererApi();
        const locked = renderer?.isSectionLocked?.(clip.sectionId || getActiveSectionId());
        if (locked) {
          global.SnipToast?.show?.('Tab is locked: cannot delete clips.');
          return;
        }
        deleteClip(clip);
      },
    };

    const clipMenu = ensureSharedClipMenu(doc);

    const handleMenuClick = (event) => {
      event.stopPropagation();
      const action = event.target?.dataset?.action;
      if (!action) return;
      const clipId = clipMenu?.dataset?.clipId;
      const clip = (app.clips || []).find((item) => item.id === clipId);
      if (!clip) return;
      const handler = clipActions[action];
      if (handler) handler(clip);
      hideSharedClipMenu();
    };

    if (clipMenu) {
      if (clipMenu._handler) {
        clipMenu.removeEventListener('click', clipMenu._handler);
      }
      clipMenu._handler = handleMenuClick;
      clipMenu.addEventListener('click', handleMenuClick);
    }

    const showClipContextMenu = (clip, x, y) => {
      if (!clip || !clipMenu) return;
      clipMenu.dataset.clipId = clip.id;
      clipMenu.style.left = `${x}px`;
      clipMenu.style.top = `${y}px`;
      clipMenu.style.display = 'block';
      const deleteItem = clipMenu.querySelector('[data-action="delete"]');
      if (deleteItem) {
        const renderer = getRendererApi();
        const locked = renderer?.isSectionLocked?.(clip.sectionId || getActiveSectionId());
        if (locked) {
          deleteItem.classList.add('disabled');
        } else {
          deleteItem.classList.remove('disabled');
        }
      }
    };

    const getClipListMode = () => {
      const appRoot = doc ? doc.getElementById('app') : null;
      if (appRoot?.classList.contains('is-narrow')) return 'narrow';
      if (appRoot?.classList.contains('is-wide')) return 'medium';
      if (appRoot?.classList.contains('is-medium')) return 'medium';
      const width = global.innerWidth || doc?.documentElement?.clientWidth || 0;
      if (width < 640) return 'narrow';
      if (width >= 960) return 'medium';
      return 'medium';
    };

    const applyClipRowState = (row, clip) => {
      if (!row || !clip) return;
      if (clip.color) {
        row.classList.add('clip-row--colored', 'has-user-color');
        row.style.setProperty('--clip-accent', clip.color);
        row.style.setProperty('--appearanceColor', clip.color);
      }
      const isCurrent = clip.id === app.currentClipId;
      const isSelected = getSelectedClipIds().has(clip.id);
      if (isCurrent || isSelected) {
        row.classList.add('selected');
      }
      if (isCurrent) {
        row.classList.add('clip-row--active', 'active');
      }
      if (isSelected) {
        row.classList.add('clip-row--selected');
      }
    };

    const createMetaIndicator = (clip) => {
      if (!doc || !clip) return null;
      const notesLength = String(clip.notes || '').trim().length;
      if (!notesLength) return null;
      const meta = doc.createElement('span');
      meta.className = 'clip-row__meta';
      meta.textContent = '.';
      return meta;
    };

    const bindClipRowEvents = (row, clip, onDrop) => {
      row.addEventListener('click', (event) => {
        const isMulti = Boolean(event?.metaKey || event?.ctrlKey);
        if (isMulti) {
          toggleSelectedClipId(clip.id);
        } else {
          clearSelectedClipIds();
        }
        notifySelection(clip, { multi: isMulti });
      });

      row.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        event.stopPropagation();
        showClipContextMenu(clip, event.clientX, event.clientY);
      });

      row.addEventListener('dragstart', (event) => {
        dragSourceId = clip.id;
        if (typeof DataTransfer !== 'undefined' && event?.dataTransfer) {
          try {
            event.dataTransfer.setData('application/x-snipboard-clip-id', clip.id);
            event.dataTransfer.setData('text/plain', clip.text || '');
            const safeTitle = clip.title || 'Clip';
            const safeBody = (clip.text || '').replace(/\n/g, '<br/>');
            event.dataTransfer.setData(
              'text/html',
              `<strong>${safeTitle}</strong><br/>${safeBody}`
            );
            event.dataTransfer.effectAllowed = 'copyMove';
          } catch {
            // ignore if dataTransfer is unavailable
          }
        }
        row.classList.add('clip-row--dragging');
      });

      row.addEventListener('dragend', () => {
        dragSourceId = null;
        row.classList.remove('clip-row--dragging');
      });

      row.addEventListener('dragover', (event) => {
        event.preventDefault();
        row.classList.add('clip-row--drop-target');
      });

      row.addEventListener('dragleave', () => {
        row.classList.remove('clip-row--drop-target');
      });

      row.addEventListener('drop', (event) => {
        event.preventDefault();
        if (dragSourceId && dragSourceId !== clip.id) {
          reorderClips(dragSourceId, clip.id);
        }
        row.classList.remove('clip-row--drop-target');
        if (typeof onDrop === 'function') {
          onDrop();
        }
      });
    };

    const ClipListItem = (clip, mode) => {
      if (!doc || !clip) return null;
      const row = doc.createElement('div');
      row.className = 'clip-row clip-list-item';
      row.dataset.clipId = clip.id;
      row.draggable = true;
      applyClipRowState(row, clip);

      if (mode === 'medium') {
        const colorStrip = doc.createElement('div');
        colorStrip.className = 'clip-color-strip';
        row.appendChild(colorStrip);
      }

      const main = doc.createElement('div');
      main.className = 'clip-row__main';

      const iconEl = createClipIconElement(clip);
      if (iconEl) main.appendChild(iconEl);

      const title = doc.createElement('div');
      title.className = 'clip-row__title';
      title.textContent = clip.title || '(Untitled)';
      main.appendChild(title);

      if (mode === 'medium') {
        const meta = createMetaIndicator(clip);
        if (meta) main.appendChild(meta);
      }

      row.appendChild(main);

      const thumbWrap = doc.createElement('div');
      thumbWrap.className = 'clip-row__thumb-wrap';

      const thumb = doc.createElement('div');
      const shots = Array.isArray(clip.screenshots)
        ? clip.screenshots.filter((name) => typeof name === 'string' && name.trim().length > 0)
        : [];
      const shotCount = shots.length;
      thumb.className = 'clip-row__thumb';
      if (!shotCount) {
        thumb.classList.add('clip-row__thumb--empty');
      }
      thumbWrap.appendChild(thumb);

      if (shotCount > 1) {
        const badge = doc.createElement('span');
        badge.className = 'clip-row__thumb-badge';
        badge.textContent = String(shotCount);
        thumbWrap.appendChild(badge);
      }

      row.appendChild(thumbWrap);

      bindClipRowEvents(row, clip, renderClipList);
      return row;
    };

    const ClipCardItem = (clip) => {
      if (!doc || !clip) return null;
      const row = doc.createElement('div');
      row.className = 'clip-row clip-card';
      row.dataset.clipId = clip.id;
      row.draggable = true;
      applyClipRowState(row, clip);

      const iconEl = createClipIconElement(clip);
      if (iconEl) row.appendChild(iconEl);

      const title = doc.createElement('div');
      title.className = 'clip-card__title';
      title.textContent = clip.title || '(Untitled)';
      row.appendChild(title);

      const hasScreenshot =
        Array.isArray(clip.screenshots) && clip.screenshots.length > 0;
      if (hasScreenshot) {
        const thumbContainer = doc.createElement('div');
        thumbContainer.className = 'clip-row__thumb clip-card__thumb';
        row.appendChild(thumbContainer);
      }

      const notesText = String(clip.notes || '').trim();
      if (notesText) {
        const notes = doc.createElement('div');
        notes.className = 'clip-card__notes';
        notes.textContent = notesText;
        row.appendChild(notes);
      }

      bindClipRowEvents(row, clip, renderClipList);
      return row;
    };

    const renderClipList = () => {
      if (!clipListEl) return;
      clipListEl.innerHTML = '';
      const viewMode = getClipListMode();
      clipListEl.classList.remove('clip-list--narrow', 'clip-list--medium', 'clip-list--wide');
      clipListEl.classList.add(`clip-list--${viewMode}`);
      const activeSectionId = getActiveSectionId();
      const activeTab =
        Array.isArray(app.tabs) && activeSectionId && activeSectionId !== 'all'
          ? (app.tabs || []).find((tab) => tab.id === activeSectionId) || null
          : null;
      const searchQuery = (app.searchQuery || app.searchText || '').toLowerCase().trim();
      const tagFilters = (app.tagFilter || '')
        .split(',')
        .map((tag) => tag.trim().toLowerCase())
        .filter(Boolean);
      const searchIndex = app.searchIndex instanceof Map ? app.searchIndex : null;
      const normalizeTags = (tags) =>
        Array.isArray(tags)
          ? tags
              .map((tag) => (tag ? String(tag).trim().toLowerCase() : ''))
              .filter(Boolean)
          : [];
      const timestampForClip = (clip) => {
        const ts = Number(clip?.updatedAt || clip?.capturedAt || clip?.createdAt || 0);
        return Number.isFinite(ts) ? ts : 0;
      };
      const defaultOrderSort = (list) => {
        if (!activeTab || !Array.isArray(activeTab.clipOrder) || !activeTab.clipOrder.length) {
          return list.slice();
        }
        const orderMap = new Map(activeTab.clipOrder.map((id, idx) => [id, idx]));
        return list.slice().sort((a, b) => {
          const aIdx = orderMap.has(a.id) ? orderMap.get(a.id) : Number.MAX_SAFE_INTEGER;
          const bIdx = orderMap.has(b.id) ? orderMap.get(b.id) : Number.MAX_SAFE_INTEGER;
          if (aIdx !== bIdx) return aIdx - bIdx;
          return 0;
        });
      };

      const filtered = (app.clips || []).filter((clip) => {
        if (activeSectionId !== 'all' && clip.sectionId !== activeSectionId) {
          return false;
        }
        if (searchQuery) {
          const haystack =
            (searchIndex && searchIndex.get(clip.id)) ||
            `${clip.title || ''} ${clip.text || ''} ${clip.notes || ''} ${
              Array.isArray(clip.tags) ? clip.tags.join(' ') : ''
            }`.toLowerCase();
          if (!haystack.includes(searchQuery)) return false;
        }
        if (tagFilters.length) {
          const clipTags = normalizeTags(clip.tags);
          const matchesAll = tagFilters.every((tag) => clipTags.includes(tag));
          if (!matchesAll) return false;
        }
        return true;
      });

      const sortMode = app.sortMode || 'default';
      const sortedClips = (() => {
        if (sortMode === 'newest') {
          return filtered.slice().sort((a, b) => timestampForClip(b) - timestampForClip(a));
        }
        if (sortMode === 'oldest') {
          return filtered.slice().sort((a, b) => timestampForClip(a) - timestampForClip(b));
        }
        if (sortMode === 'title') {
          return filtered
            .slice()
            .sort((a, b) => (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' }));
        }
        return defaultOrderSort(filtered);
      })();

      const renderItem =
        viewMode === 'wide'
          ? (clip) => ClipCardItem(clip)
          : (clip) => ClipListItem(clip, viewMode);
      sortedClips.forEach((clip) => {
        const row = renderItem(clip);
        if (row) clipListEl.appendChild(row);
      });

      const rendererApi = getRendererApi();
      rendererApi.refreshClipThumbnails?.();
    };

    if (clipListEl) {
      clipListEl.addEventListener('dragover', (event) => {
        if (dragSourceId) event.preventDefault();
      });

      clipListEl.addEventListener('drop', (event) => {
        event.preventDefault();
        if (dragSourceId) {
          dragSourceId = null;
          renderClipList();
        }
      });
    }

    return {
      renderClipList,
      onClipSelected,
      setEditorApi,
      setModalsApi,
    };
  }

  global.SnipClips = { initClips };
})(window);
