(function (global) {
  function initClips({ state = {}, dom = {} } = {}) {
    const app = state;
    const doc = global.document;
    const clipListEl = dom.clipListContainer || (doc ? doc.getElementById('clipList') : null);
    const clipSelectedListeners = [];
    let editorApi = null;
    let modalsApi = null;
    let dragSourceId = null;

    const getActiveSectionId = () => app.activeTabId || 'all';

    const setEditorApi = (api) => {
      editorApi = api;
    };

    const setModalsApi = (api) => {
      modalsApi = api;
    };

    const onClipSelected = (callback) => {
      if (typeof callback === 'function') clipSelectedListeners.push(callback);
    };

    const getSelectedClipIds = () => {
      if (!clipListEl) return [];
      return Array.from(clipListEl.querySelectorAll('input[type=checkbox]:checked')).map((checkbox) => checkbox.dataset.clipId).filter(Boolean);
    };

    const notifySelection = (clip) => {
      clipSelectedListeners.forEach((cb) => {
        try {
          cb(clip);
        } catch (err) {
          console.warn('[SnipClips] onClipSelected handler failed', err);
        }
      });
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

    const renderClipList = () => {
      if (!clipListEl) return;
      clipListEl.innerHTML = '';
      const clips = (app.clips || []).filter((clip) => getActiveSectionId() === 'all' || clip.sectionId === getActiveSectionId());
      clips.forEach((clip) => {
        if (!doc) return;
        const row = doc.createElement('div');
        row.className = 'clip-row';
        row.dataset.clipId = clip.id;
        row.draggable = true;

        if (clip.id === app.currentClipId) {
          row.classList.add('clip-row--active');
        }

        const checkbox = doc.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.dataset.clipId = clip.id;
        checkbox.addEventListener('click', (event) => event.stopPropagation());
        row.appendChild(checkbox);

        const title = doc.createElement('div');
        title.className = 'clip-row__title';
        title.textContent = clip.title || '(Untitled)';
        row.appendChild(title);

        row.addEventListener('click', () => {
          app.currentClipId = clip.id;
          notifySelection(clip);
          renderClipList();
        });

        row.addEventListener('dragstart', () => {
          dragSourceId = clip.id;
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

        row.addEventListener('drop', () => {
          if (dragSourceId && dragSourceId !== clip.id) {
            reorderClips(dragSourceId, clip.id);
          }
          row.classList.remove('clip-row--drop-target');
          renderClipList();
        });

        clipListEl.appendChild(row);
      });
    };

    if (clipListEl) {
      clipListEl.addEventListener('dragover', (event) => {
        if (dragSourceId) event.preventDefault();
      });

      clipListEl.addEventListener('drop', () => {
        if (dragSourceId) {
          dragSourceId = null;
          renderClipList();
        }
      });
    }

    return {
      renderClipList,
      onClipSelected,
      getSelectedClipIds,
      setEditorApi,
      setModalsApi,
    };
  }

  global.SnipClips = { initClips };
})(window);
