/* eslint-env browser */
/* global File */
(() => {
  const api = window.api || {};
  const {
    AppState,
    DEFAULT_SCHEMA,
    normalizeClip,
    normalizeExportPath,
    TAB_COLORS,
    normalizeTabs,
    updateSearchIndex,
    sectionLabel,
    validateUrl,
  } = window.SnipState || {};

  const {
    CHANNELS,
    invoke: rawInvoke,
    safeInvoke,
  } = window.SnipIPC || {};

  const { initTabs } = window.SnipTabs || {};
  const { initClips } = window.SnipClips || {};
  const { initEditor } = window.SnipEditor || {};
  const { initModals } = window.SnipModals || {};

  const invoke = rawInvoke || (async () => {});
  const safeChannel = safeInvoke || invoke;
  const SCREENSHOT_BASE_URL = "http://127.0.0.1:4050/screenshots";
  const labelForSection = typeof sectionLabel === "function" ? sectionLabel : (id) => id || "Section";
  const state = AppState || {
    tabs: [],
    sections: [],
    clips: [],
    activeTabId: 'all',
    currentClipId: null,
    searchQuery: '',
    tagFilter: '',
  };

window.__SNIPBOARD_STATE__ = state;

  const editorParams = new URLSearchParams(window.location.search || '');
  const isEditorOnly = editorParams.get('mode') === 'screenshot-editor';
  const initialEditorFilename = editorParams.get('file');

  const RESERVED_SECTION_IDS = new Set(['delete', 'open', 'save', 'drag']);
  const isReservedSectionId = (value) => {
    if (!value) return false;
    return RESERVED_SECTION_IDS.has(String(value).trim().toLowerCase());
  };
  const normalizeSectionId = (value) => {
    if (typeof value !== 'string') return '';
    const trimmed = value.trim();
    if (!trimmed || trimmed === 'all' || isReservedSectionId(trimmed)) return '';
    return trimmed;
  };
  const resolveFallbackSectionId = () => {
    const sections = Array.isArray(state.sections) ? state.sections : [];
    const fallback = sections.find(
      (sec) => sec && sec.id && sec.id !== 'all' && !isReservedSectionId(sec.id)
    );
    return fallback?.id || 'inbox';
  };
  const sanitizeTabsState = (tabs, activeTabId) => {
    const list = Array.isArray(tabs) ? tabs : [];
    const safeTabs = list.filter((tab) => tab && tab.id && !isReservedSectionId(tab.id));
    const safeIds = new Set(safeTabs.map((tab) => tab.id));
    const nextActive =
      activeTabId === 'all'
        ? 'all'
        : safeIds.has(activeTabId)
        ? activeTabId
        : safeTabs[0]?.id || 'all';
    const changed = safeTabs.length !== list.length || nextActive !== activeTabId;
    return { tabs: safeTabs, activeTabId: nextActive, changed };
  };

  let refreshFullQueue = Promise.resolve();

  const applySectionExportPaths = (tabs, sections) => {
    if (!Array.isArray(tabs) || !tabs.length) return tabs;
    if (!Array.isArray(sections) || !sections.length) return tabs;
    const normalizeExport =
      typeof normalizeExportPath === 'function'
        ? normalizeExportPath
        : (value) => (typeof value === 'string' ? value.trim() : '');
    const sectionMap = new Map(
      sections
        .filter((section) => section && section.id)
        .map((section) => [section.id, section])
    );
    return tabs.map((tab) => {
      if (!tab || !tab.id) return tab;
      const section = sectionMap.get(tab.id);
      if (!section) return tab;
      const exportPath =
        typeof section.exportPath === 'string' ? section.exportPath : '';
      const exportFolder =
        typeof section.exportFolder === 'string' ? section.exportFolder : '';
      const exportLabel = section.name || section.id || tab.label || tab.name || tab.id || 'Tab';
      const normalizedPath = normalizeExport(exportPath || exportFolder, exportLabel);
      const normalizedFolder = normalizeExport(exportFolder || exportPath, exportLabel);
      return {
        ...tab,
        exportPath: normalizedPath,
        exportFolder: normalizedFolder,
      };
    });
  };

  const resolveClipForSection = (sectionId) => {
    const clips = state.clips || [];
    const targetSection = sectionId || getActiveSectionId();
    const currentId = state.currentClipId;
    if (!currentId) return null;
    if (targetSection === 'all') {
      return clips.find((clip) => clip.id === currentId) || null;
    }
    return clips.find(
      (clip) => clip.id === currentId && clip.sectionId === targetSection
    ) || null;
  };

  const getCurrentClip = () => resolveClipForSection(getActiveSectionId());     
  let manualClipSelection = false;
  let lastWindowMode = null;

  const WINDOW_MODES = Object.freeze({
    FULL: 'full',
    WRITING: 'writing',
    TABS: 'tabs',
    QUARTER: 'quarter',
    MINIMIZED: 'minimized',
  });

  const resolveLayoutMode = () => {
    if (state.currentClipId) return 'review';
    if (state.activeTabId) return 'work';
    return 'launcher';
  };

  const resolveWindowMode = () => {
    if (state.currentClipId) return WINDOW_MODES.WRITING;
    const clips = Array.isArray(state.clips) ? state.clips : [];
    if (clips.length === 0) return WINDOW_MODES.QUARTER;
    if (state.activeTabId) return WINDOW_MODES.TABS;
    return WINDOW_MODES.MINIMIZED;
  };

  const hasSchemaField = (schema, field) => {
    if (!Array.isArray(schema)) return false;
    const target = String(field || "").toLowerCase();
    return schema.some((item) => String(item || "").toLowerCase() === target);
  };

  function normalizeTags(raw) {
    if (Array.isArray(raw)) {
      return raw.map((tag) => (tag ? String(tag).trim() : '')).filter(Boolean);
    }
    if (typeof raw === 'string') {
      return raw.split(',').map((tag) => tag.trim()).filter(Boolean);
    }
    return [];
  }

  const sanitizeExternalText = (value) => {
    if (typeof value !== 'string') return '';
    // eslint-disable-next-line no-control-regex -- strip null bytes from external input.
    return value.replace(/\u0000/g, '');
  };

  const normalizeClipTitle = (value) => {
    if (typeof value !== 'string') return 'Untitled';
    const trimmed = value.trim();
    return trimmed || 'Untitled';
  };

  const normalizeClipText = (value) => (typeof value === 'string' ? value : '');
  const normalizeClipNotes = (value) => (typeof value === 'string' ? value : '');

  function sanitizeClipData(clip) {
    if (!clip) return clip;
    clip.title = normalizeClipTitle(clip.title);
    clip.text = normalizeClipText(clip.text);
    clip.notes = normalizeClipNotes(clip.notes);
    if (!Array.isArray(clip.screenshots)) {
      clip.screenshots = [];
    }
    clip.screenshots = clip.screenshots
      .map((name) => (typeof name === 'string' ? name.trim() : ''))
      .filter(Boolean);
    if (!Array.isArray(clip.tags)) {
      if (typeof clip.tags === 'string') {
        clip.tags = clip.tags
          .split(',')
          .map((tag) => (tag ? tag.trim() : ''))
          .filter(Boolean);
      } else {
        clip.tags = [];
      }
    } else {
      clip.tags = clip.tags
        .map((tag) => (tag ? String(tag).trim() : ''))
        .filter(Boolean);
    }
    if ((clip.color === undefined || clip.color === null || clip.color === '') && (clip.appearanceColor || clip.userColor)) {
      clip.color = clip.appearanceColor || clip.userColor || '';
    }
    if (clip.appearanceColor !== undefined) delete clip.appearanceColor;
    if (clip.userColor !== undefined) delete clip.userColor;
    const nextSectionId = normalizeSectionId(clip.sectionId) || resolveFallbackSectionId();
    if (clip.sectionId !== nextSectionId) clip.sectionId = nextSectionId;
    clip.tags = normalizeTags(clip.tags);
    normalizeClipScreenshots(clip);
    return clip;
  }

  let screenshotContextMenu = null;

  function ensureScreenshotContextMenu() {
    if (screenshotContextMenu) return screenshotContextMenu;
    const menu = document.createElement('div');
    menu.className = 'sb-screenshot-menu';
    menu.style.position = 'absolute';
    menu.style.display = 'none';
    menu.style.zIndex = '99999';
    menu.innerHTML = `
      <button data-action="edit">Edit Screenshot</button>
      <button data-action="remove">Remove from Clip</button>
    `;
    menu.addEventListener('click', async (event) => {
      const action = event.target?.dataset?.action;
      if (!action) return;
      const filename = menu.dataset.filename;
      const index = Number(menu.dataset.index);
      menu.style.display = 'none';
      const clip = getCurrentClip();
      if (!clip) return;
      if (action === 'edit') {
        openScreenshotEditor(filename);
        return;
      }
      if (action === 'remove') {
        const locked = isCurrentSectionLocked(clip.sectionId);
        if (locked) return;
        if (!Number.isFinite(index)) return;
        const updated = [...clip.screenshots];
        updated.splice(index, 1);
        clip.screenshots = updated;
        const saved = await api.saveClip?.(clip, { mirror: false });
        if (saved) {
          const idx = (state.clips || []).findIndex((item) => item.id === saved.id);
          if (idx !== -1) {
            state.clips[idx] = sanitizeClipData(normalizeClip(saved));
          }
        }
        await refreshEditor();
        refreshClipThumbnails();
      }
    });
    document.body.appendChild(menu);
    screenshotContextMenu = menu;
    return menu;
  }

  document.addEventListener('click', () => {
    if (screenshotContextMenu) {
      screenshotContextMenu.style.display = 'none';
    }
  });

  function normalizeClipScreenshots(clip) {
    if (!clip) return clip;
    if (!Array.isArray(clip.screenshots)) {
      clip.screenshots = [];
    }
    clip.screenshots = clip.screenshots.filter(
      (name) => typeof name === 'string' && name.trim().length > 0
    );
    return clip;
  }

  const missingScreenshotSet = new Set();
  const screenshotUrlCache = new Map();
  const reportMissingScreenshot = (filename, context) => {
    const key = typeof filename === 'string' ? filename : String(filename || '');
    if (!key || missingScreenshotSet.has(key)) return;
    missingScreenshotSet.add(key);
    const suffix = context ? ` (${context})` : '';
    console.warn(`Missing screenshot${suffix}:`, key);
  };
  const canRevokeObjectUrl =
    typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function';

  let editorRoot = null;
  let editorMountMarker = null;
  let clipPaneRoot = null;
  let clipPaneMountMarker = null;
  const ensureEditorMount = () => {
    if (editorRoot) return;
    editorRoot = document.getElementById('editor');
    if (!editorRoot) return;
    const parent = editorRoot.parentNode;
    if (!parent) return;
    editorMountMarker = document.createComment('snipboard-editor-mount');
    parent.insertBefore(editorMountMarker, editorRoot);
  };
  const ensureClipPaneMount = () => {
    if (clipPaneRoot) return;
    clipPaneRoot = document.getElementById('clipPane');
    if (!clipPaneRoot) return;
    const parent = clipPaneRoot.parentNode;
    if (!parent) return;
    clipPaneMountMarker = document.createComment('snipboard-clippane-mount');
    parent.insertBefore(clipPaneMountMarker, clipPaneRoot);
  };
  const syncEditorMount = (shouldMount) => {
    ensureEditorMount();
    if (!editorRoot || !editorMountMarker) return;
    if (!shouldMount) {
      if (editorRoot.parentNode) {
        editorRoot.parentNode.removeChild(editorRoot);
      }
      return;
    }
    if (!editorRoot.parentNode) {
      const parent = editorMountMarker.parentNode;
      if (parent) {
        parent.insertBefore(editorRoot, editorMountMarker.nextSibling);
      }
    }
  };
  const syncClipPaneMount = (shouldMount) => {
    ensureClipPaneMount();
    if (!clipPaneRoot || !clipPaneMountMarker) return;
    if (!shouldMount) {
      if (clipPaneRoot.parentNode) {
        clipPaneRoot.parentNode.removeChild(clipPaneRoot);
      }
      return;
    }
    if (!clipPaneRoot.parentNode) {
      const parent = clipPaneMountMarker.parentNode;
      if (parent) {
        parent.insertBefore(clipPaneRoot, clipPaneMountMarker.nextSibling);
        refreshClipThumbnails();
      }
    }
  };

  const applyWindowModeLayout = (mode) => {
    switch (mode) {
      case WINDOW_MODES.MINIMIZED:
        syncClipPaneMount(false);
        syncEditorMount(false);
        break;
      case WINDOW_MODES.TABS:
      case WINDOW_MODES.QUARTER:
        syncClipPaneMount(true);
        syncEditorMount(false);
        break;
      case WINDOW_MODES.WRITING:
      case WINDOW_MODES.FULL:
      default:
        syncClipPaneMount(true);
        syncEditorMount(true);
        break;
    }
  };

  const revokeScreenshotUrl = (url) => {
    if (!canRevokeObjectUrl || typeof url !== 'string') return;
    if (!url.startsWith('blob:')) return;
    try {
      URL.revokeObjectURL(url);
    } catch {
      // ignore invalid object URLs
    }
  };

  const evictCachedScreenshotUrl = (key) => {
    if (!screenshotUrlCache.has(key)) return;
    const url = screenshotUrlCache.get(key);
    revokeScreenshotUrl(url);
    screenshotUrlCache.delete(key);
  };

  const clearScreenshotUrlCache = () => {
    if (!screenshotUrlCache.size) return;
    for (const url of screenshotUrlCache.values()) {
      revokeScreenshotUrl(url);
    }
    screenshotUrlCache.clear();
  };

  async function getCachedScreenshotUrl(filename) {
    const safeName = typeof filename === 'string' ? filename : String(filename || '');
    if (!safeName) return null;
    if (screenshotUrlCache.has(safeName)) {
      return screenshotUrlCache.get(safeName);
    }
    try {
      const url = `${SCREENSHOT_BASE_URL}/${encodeURIComponent(safeName)}`;
      screenshotUrlCache.set(safeName, url);
      return url;
    } catch {
      reportMissingScreenshot(safeName, 'url');
      screenshotUrlCache.set(safeName, null);
      return null;
    }
  }

  const syncSectionsFromTabs = () => {
    const tabs = Array.isArray(state.tabs) ? state.tabs : [];
    const safeTabs = tabs.filter((tab) => tab && tab.id && !isReservedSectionId(tab.id));
    if (safeTabs.length !== tabs.length) {
      state.tabs = safeTabs;
    }
    state.sections = safeTabs.map((tab) => ({
      id: tab.id,
      name:
        tab.label ||
        tab.name ||
        labelForSection(tab.id) ||
        tab.id ||
        'Section',
      locked: Boolean(tab.locked),
      color: tab.color || '',
      icon: tab.icon || '',
      exportPath: tab.exportPath || tab.exportFolder || '',
      exportFolder: tab.exportFolder || tab.exportPath || '',
    }));
  };

  const refreshSectionSelect = () => {
    if (!sectionSelect || !sectionSelect.isConnected) return;
    const doc = sectionSelect.ownerDocument || document;
    const fragment = doc.createDocumentFragment();
    (state.sections || []).forEach((sec) => {
      if (!sec || !sec.id || isReservedSectionId(sec.id)) return;
      const option = doc.createElement('option');
      option.value = sec.id || '';
      option.textContent = sec.name || labelForSection(sec.id);
      fragment.appendChild(option);
    });
    sectionSelect.textContent = '';
    sectionSelect.appendChild(fragment);
    const clip = getCurrentClip();
    sectionSelect.value = clip?.sectionId || state.activeTabId || '';
  };

  const ensureCurrentClipSection = (clip) => {
    if (!clip) return;
    const hasSection = (state.sections || []).some((sec) => sec.id === clip.sectionId);
    if (!hasSection) {
      clip.sectionId = state.sections[0]?.id || 'all';
    }
  };

  function isCurrentSectionLocked(sectionId) {
    const sectionIdToCheck = sectionId || getActiveSectionId();
    if (sectionIdToCheck === 'all') return false;
    const section = (state.sections || []).find((sec) => sec.id === sectionIdToCheck);
    return Boolean(section?.locked);
  }

  function updateEditorControls() {
    const clip = getCurrentClip();
    const enabled = Boolean(clip);
    const locked = isCurrentSectionLocked();
    if (saveClipBtn) saveClipBtn.disabled = !enabled;
    if (deleteClipBtn) deleteClipBtn.disabled = !enabled || locked;
    if (addShotBtn) addShotBtn.disabled = !enabled;
  }

  const sanitizeAppearancePatch = (patch = {}) => {
    const clean = {};
    if (typeof patch.color === 'string') {
      const c = patch.color.trim();
      if (c && !/[<>]/.test(c) && c.length <= 64) clean.color = c;
    }
    if (typeof patch.icon === 'string') {
      const i = patch.icon.trim();
      if (i && !/[<>]/.test(i) && i.length <= 16) clean.icon = i;
    }
    return clean;
  };

  // Editor screenshots are independent of the clip list so we load them separately.
  async function renderEditorScreenshots(clip) {
    if (!screenshotBox) return;
    screenshotBox.innerHTML = '';
    normalizeClipScreenshots(clip);
    const screenshots = (clip?.screenshots || []).filter(
      (file) => file && typeof file === 'string' && file.trim() !== ''
    );
    clip.screenshots = screenshots;
    for (let index = 0; index < screenshots.length; index += 1) {
      const file = screenshots[index];
      const url = await getCachedScreenshotUrl(file);
      if (!url) continue;
      const thumb = document.createElement('div');
      thumb.className = 'screenshot-thumb';
      thumb.draggable = true;
      thumb.dataset.index = String(index);
      thumb.dataset.file = file;
      const img = document.createElement('img');
      img.className = 'thumb';
      img.alt = clip?.title || 'Screenshot';
      img.src = url;
      img.style.width = '120px';
      img.style.height = '90px';
      img.style.objectFit = 'cover';
      img.style.borderRadius = '10px';
      img.onerror = () => {
        thumb.style.display = 'none';
      };
      thumb.appendChild(img);

      // Drag/drop carries the screenshot filename so reordering stays in-memory.
      thumb.addEventListener('dragstart', async (event) => {
        event.dataTransfer.effectAllowed = 'copyMove';
        const filename = thumb.dataset.file;
        if (filename) {
          try {
            event.dataTransfer.setData('text/plain', filename);
            const fileUrl = `${SCREENSHOT_BASE_URL}/${encodeURIComponent(filename)}`;
            event.dataTransfer.setData('text/uri-list', fileUrl);
            if (typeof File !== 'undefined') {
              try {
                const response = await fetch(fileUrl);
                const blob = await response.blob();
                if (blob && event.dataTransfer?.items) {
                  const fileObj = new File([blob], filename, { type: blob.type || 'image/png' });
                  event.dataTransfer.items.add(fileObj);
                }
              } catch (err) {
                console.warn('Drag image blob failed', err);
              }
            }
          } catch (err) {
            console.warn('Screenshot dragstart failed', err);
          }
        }
        thumb.classList.add('screenshot-thumb--dragging');
      });
      thumb.addEventListener('dragover', (event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        thumb.classList.add('screenshot-thumb--drag-over');
      });
      thumb.addEventListener('dragleave', () => {
        thumb.classList.remove('screenshot-thumb--drag-over');
      });
        thumb.addEventListener('drop', (event) => {
          event.preventDefault();
          thumb.classList.remove('screenshot-thumb--drag-over');
          const dragged = sanitizeExternalText(event.dataTransfer?.getData('text/plain') || '');
          const clip = getCurrentClip();
          if (!clip || !dragged) return;
          const updated = (clip.screenshots || []).filter((shot) => shot !== dragged);
        const targetIndex = Number(thumb.dataset.index);
        if (!Number.isFinite(targetIndex)) return;
        const insertAt = targetIndex > updated.length ? updated.length : targetIndex;
        updated.splice(insertAt, 0, dragged);
        clip.screenshots = updated;
        renderEditorScreenshots(clip);
        refreshClipThumbnails();
      });
      thumb.addEventListener('dragend', () => {
        thumb.classList.remove('screenshot-thumb--drag-over');
      });
      thumb.addEventListener('click', () => {
        openScreenshotEditor(file);
      });
      thumb.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const menu = ensureScreenshotContextMenu();
        const clip = getCurrentClip();
        const locked = isCurrentSectionLocked(clip?.sectionId);
        const removeBtn = menu.querySelector('[data-action="remove"]');
        if (removeBtn) {
          removeBtn.disabled = Boolean(locked);
          if (locked) {
            removeBtn.classList.add('disabled');
            removeBtn.setAttribute('aria-disabled', 'true');
          } else {
            removeBtn.classList.remove('disabled');
            removeBtn.removeAttribute('aria-disabled');
          }
        }
        menu.dataset.filename = file;
        menu.dataset.index = thumb.dataset.index;
        menu.style.left = `${event.pageX}px`;
        menu.style.top = `${event.pageY}px`;
        menu.style.display = 'block';
      });

      screenshotBox.appendChild(thumb);
    }
  }

  function getCanvasCoords(evt, canvas) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width ? canvas.width / rect.width : 1;
    const scaleY = rect.height ? canvas.height / rect.height : 1;
    return {
      x: (evt.clientX - rect.left) * scaleX,
      y: (evt.clientY - rect.top) * scaleY,
    };
  }

  function getEditorAvailableSize(dialog, toolbar) {
    if (!dialog || !toolbar) {
      return { availableWidth: 1, availableHeight: 1 };
    }
    const dialogRect = dialog.getBoundingClientRect();
    const toolbarRect = toolbar.getBoundingClientRect();
    const dialogStyles = window.getComputedStyle(dialog);
    const paddingX =
      Number.parseFloat(dialogStyles.paddingLeft) +
      Number.parseFloat(dialogStyles.paddingRight);
    const paddingY =
      Number.parseFloat(dialogStyles.paddingTop) +
      Number.parseFloat(dialogStyles.paddingBottom);
    const gapValue = Number.parseFloat(dialogStyles.rowGap || dialogStyles.gap) || 0;
    const availableWidth = Math.max(1, dialogRect.width - paddingX);
    const availableHeight = Math.max(
      1,
      dialogRect.height - paddingY - toolbarRect.height - gapValue
    );
    return { availableWidth, availableHeight };
  }

  /** Screenshot editor overlay **/
  const screenshotEditorPalette = Array.isArray(TAB_COLORS) && TAB_COLORS.length
    ? TAB_COLORS.slice()
    : ['#6E6E6E', '#CFCFCF', '#F7F3D6', '#485B9A', '#3A7BEB', '#3CB371'];
  let screenshotEditor = null;

  function ensureScreenshotEditor() {
    if (screenshotEditor) return screenshotEditor;
    const overlay = document.createElement('div');
    overlay.className = 'screenshot-editor-overlay';
    overlay.style.display = 'none';
    overlay.innerHTML = `
      <div class="screenshot-editor-dialog">
        <div class="screenshot-editor-toolbar">
          <div class="screenshot-editor-tools">
            <button type="button" class="screenshot-editor-tool active" data-tool="pen" aria-label="Pen tool">Pen</button>
            <button type="button" class="screenshot-editor-tool" data-tool="eraser" aria-label="Eraser tool">Eraser</button>
          </div>
          <div class="screenshot-editor-swatches">
            ${screenshotEditorPalette
              .map(
                (color) =>
                  `<button type="button" class="color-swatch" data-color="${color}" style="background:${color}" aria-label="Color ${color}"></button>`
              )
              .join('')}
          </div>
          <div class="screenshot-editor-actions">
            <button type="button" class="btn ghost" data-action="cancel">Cancel</button>
            <button type="button" class="btn" data-action="save">Save</button>
          </div>
          <input type="color" class="screenshot-editor-color-picker" value="#0f172a" aria-label="Brush color" />
        </div>
        <canvas class="screenshot-editor-canvas"></canvas>
      </div>
    `;
    document.body.appendChild(overlay);

    const canvas = overlay.querySelector('.screenshot-editor-canvas');
    const ctx = canvas.getContext('2d');
    const colorInput = overlay.querySelector('.screenshot-editor-color-picker');
    const dialog = overlay.querySelector('.screenshot-editor-dialog');
    const toolbar = overlay.querySelector('.screenshot-editor-toolbar');
    const toolButtons = overlay.querySelectorAll('[data-tool]');
    const swatchButtons = overlay.querySelectorAll('.screenshot-editor-swatches .color-swatch');
    const actionButtons = overlay.querySelectorAll('[data-action]');

    const state = {
      tool: 'pen',
      color: colorInput.value || '#0f172a',
      filename: null,
      isDrawing: false,
      pointerId: null,
      escHandler: null,
      baseImage: null,
      imageWidth: null,
      imageHeight: null,
      zoom: 1,
      offsetX: 0,
      offsetY: 0,
      viewWidth: 0,
      viewHeight: 0,
    };

    const baseCanvas = document.createElement('canvas');
    const baseCtx = baseCanvas.getContext('2d');

    const clampZoom = (value) => Math.min(4, Math.max(0.1, value));
    const clampOffsets = () => {
      if (!state.imageWidth || !state.imageHeight) return;
      const scaledWidth = state.imageWidth * state.zoom;
      const scaledHeight = state.imageHeight * state.zoom;
      if (scaledWidth <= state.viewWidth) {
        state.offsetX = (state.viewWidth - scaledWidth) / 2;
      } else {
        const minX = state.viewWidth - scaledWidth;
        state.offsetX = Math.min(0, Math.max(minX, state.offsetX));
      }
      if (scaledHeight <= state.viewHeight) {
        state.offsetY = (state.viewHeight - scaledHeight) / 2;
      } else {
        const minY = state.viewHeight - scaledHeight;
        state.offsetY = Math.min(0, Math.max(minY, state.offsetY));
      }
    };

    const updateViewportSize = () => {
      if (!dialog || !toolbar) return;
      const { availableWidth, availableHeight } = getEditorAvailableSize(
        dialog,
        toolbar
      );
      state.viewWidth = Math.max(1, Math.round(availableWidth));
      state.viewHeight = Math.max(1, Math.round(availableHeight));
      canvas.width = state.viewWidth;
      canvas.height = state.viewHeight;
      clampOffsets();
    };

    const renderEditorCanvas = () => {
      if (!state.baseImage || !state.imageWidth || !state.imageHeight) return;
      updateViewportSize();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(state.zoom, 0, 0, state.zoom, state.offsetX, state.offsetY);
      ctx.drawImage(baseCanvas, 0, 0);
    };

    let renderFrame = null;
    const scheduleRender = () => {
      if (renderFrame) return;
      renderFrame = window.requestAnimationFrame(() => {
        renderFrame = null;
        renderEditorCanvas();
      });
    };

    const applyBrushSettings = () => {
      if (!baseCtx) return;
      baseCtx.lineCap = 'round';
      baseCtx.lineJoin = 'round';
      baseCtx.lineWidth = state.tool === 'eraser' ? 28 : 6;
      baseCtx.globalCompositeOperation = state.tool === 'eraser' ? 'destination-out' : 'source-over';
      baseCtx.strokeStyle = state.color;
    };

    const pointerDown = (event) => {
      event.preventDefault();
      if (!state.baseImage || !baseCtx) return;
      state.isDrawing = true;
      state.pointerId = event.pointerId;
      applyBrushSettings();
      const { x, y } = getCanvasCoords(event, canvas);
      const imageX = (x - state.offsetX) / state.zoom;
      const imageY = (y - state.offsetY) / state.zoom;
      baseCtx.beginPath();
      baseCtx.moveTo(imageX, imageY);
      canvas.setPointerCapture(event.pointerId);
    };

    const pointerMove = (event) => {
      if (!state.isDrawing || state.pointerId !== event.pointerId || !baseCtx) return;
      const { x, y } = getCanvasCoords(event, canvas);
      const imageX = (x - state.offsetX) / state.zoom;
      const imageY = (y - state.offsetY) / state.zoom;
      baseCtx.lineTo(imageX, imageY);
      baseCtx.stroke();
      scheduleRender();
    };

    const stopDrawing = () => {
      if (!state.isDrawing) return;
      state.isDrawing = false;
      if (state.pointerId && canvas.hasPointerCapture(state.pointerId)) {
        canvas.releasePointerCapture(state.pointerId);
      }
      state.pointerId = null;
    };

    canvas.addEventListener('pointerdown', pointerDown);
    canvas.addEventListener('pointermove', pointerMove);
    canvas.addEventListener('pointerup', stopDrawing);
    canvas.addEventListener('pointercancel', stopDrawing);
    canvas.addEventListener('pointerleave', stopDrawing);
    canvas.addEventListener(
      'wheel',
      (event) => {
        if (!state.baseImage) return;
        const { deltaY } = event;
        if (event.ctrlKey) {
          event.preventDefault();
          const zoomDelta = deltaY < 0 ? 1.1 : 0.9;
          const nextZoom = clampZoom(state.zoom * zoomDelta);
          const { x, y } = getCanvasCoords(event, canvas);
          const imageX = (x - state.offsetX) / state.zoom;
          const imageY = (y - state.offsetY) / state.zoom;
          state.zoom = nextZoom;
          state.offsetX = x - imageX * state.zoom;
          state.offsetY = y - imageY * state.zoom;
          clampOffsets();
          renderEditorCanvas();
          return;
        }
        const scaledWidth = state.imageWidth * state.zoom;
        const scaledHeight = state.imageHeight * state.zoom;
        const canPan =
          scaledWidth > state.viewWidth || scaledHeight > state.viewHeight;
        if (!canPan) return;
        event.preventDefault();
        if (event.shiftKey) {
          state.offsetX -= deltaY;
        } else {
          state.offsetY -= deltaY;
        }
        clampOffsets();
        renderEditorCanvas();
      },
      { passive: false }
    );

    toolButtons.forEach((button) => {
      button.addEventListener('click', () => {
        toolButtons.forEach((btn) => btn.classList.remove('active'));
        button.classList.add('active');
        state.tool = button.dataset.tool || 'pen';
      });
    });

    colorInput.addEventListener('input', () => {
      state.color = colorInput.value;
    });

    swatchButtons.forEach((swatch) => {
      swatch.addEventListener('click', () => {
        const next = swatch.dataset.color;
        if (!next) return;
        state.color = next;
        colorInput.value = next;
      });
    });

    const close = () => {
      if (isEditorOnly) {
        window.close();
        return;
      }
      overlay.style.display = 'none';
      state.filename = null;
      state.isDrawing = false;
      state.pointerId = null;
      if (state.escHandler) {
        window.removeEventListener('keydown', state.escHandler);
        state.escHandler = null;
      }
    };

    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        close();
      }
    });

    const handleSave = async () => {
      if (!state.filename) return;
      try {
        const dataUrl = baseCanvas ? baseCanvas.toDataURL('image/png') : canvas.toDataURL('image/png');
        await api.saveScreenshot?.([{ filename: state.filename, dataUrl }]);
        evictCachedScreenshotUrl(state.filename);
        if (isEditorOnly) {
          api.send?.('screenshot-editor:updated', { filename: state.filename });
        } else {
          const clip = getCurrentClip();
          if (clip) {
            await renderEditorScreenshots(clip);
          }
          refreshClipThumbnails();
        }
        window.SnipToast?.show?.('Screenshot saved');
      } catch (err) {
        console.error('Screenshot edit save failed', err);
        window.SnipToast?.show?.('Failed to save screenshot');
      } finally {
        close();
      }
    };

    actionButtons.forEach((button) => {
      const action = button.dataset.action;
      if (action === 'save') {
        button.addEventListener('click', handleSave);
        return;
      }
      if (action === 'cancel') {
        button.addEventListener('click', close);
      }
    });

    if (dialog && toolbar && window.ResizeObserver) {
      const resizeObserver = new ResizeObserver(() => {
        if (overlay.style.display !== 'flex') return;
        renderEditorCanvas();
      });
      resizeObserver.observe(dialog);
    }

    screenshotEditor = {
      overlay,
      canvas,
      ctx,
      baseCanvas,
      baseCtx,
      state,
      close,
      dialog,
      toolbar,
      renderEditorCanvas,
    };
    return screenshotEditor;
  }

  const getEditorPaneWidth = () => {
    const target = editorRoot || document.getElementById('editor');
    if (target) {
      const rect = target.getBoundingClientRect();
      if (rect.width) return rect.width;
    }
    const appRoot = document.getElementById('app');
    if (appRoot && typeof window.getComputedStyle === 'function') {
      const raw = window.getComputedStyle(appRoot).getPropertyValue('--editor-pane-width');
      const parsed = Number.parseFloat(raw);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
    return 420;
  };

  async function openScreenshotEditor(filename) {
      if (!filename) return;
      if (!isEditorOnly) {
        if (typeof api.openScreenshotEditor === 'function') {
          await api.openScreenshotEditor(filename);
        } else if (typeof api.invoke === 'function') {
          await api.invoke('screenshot-editor:open', filename);
        }
        return;
      }
      const editor = ensureScreenshotEditor();
      const url = await getCachedScreenshotUrl(filename);
      if (!url) {
        window.SnipToast?.show?.('Screenshot missing');
        return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const width = img.naturalWidth || img.width || 800;
      const height = img.naturalHeight || img.height || 600;
      editor.overlay.style.display = 'flex';
      if (!editor.dialog || !editor.toolbar) return;
      editor.state.baseImage = img;
      editor.state.imageWidth = width;
      editor.state.imageHeight = height;
      editor.state.zoom = 1;
      editor.state.offsetX = 0;
      editor.state.offsetY = 0;
      if (editor.baseCanvas && editor.baseCtx) {
        editor.baseCanvas.width = Math.max(1, Math.round(width));
        editor.baseCanvas.height = Math.max(1, Math.round(height));
        editor.baseCtx.setTransform(1, 0, 0, 1, 0, 0);
        editor.baseCtx.clearRect(0, 0, editor.baseCanvas.width, editor.baseCanvas.height);
        editor.baseCtx.drawImage(img, 0, 0, width, height);
      }
      editor.renderEditorCanvas();
    };
    img.onerror = () => {
      window.SnipToast?.show?.('Unable to load screenshot');
    };
    img.src = url;
    editor.state.filename = filename;
    if (editor.state.escHandler) {
      window.removeEventListener('keydown', editor.state.escHandler);
    }
    const escHandler = (event) => {
      const target = event.target;
      const tag = target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (event.key === 'Escape') {
        editor.close();
        return;
      }
    };
    editor.state.escHandler = escHandler;
    window.addEventListener('keydown', escHandler);
  }

  let screenshotEditorIpcBound = false;
  const bindScreenshotEditorIpc = () => {
    if (screenshotEditorIpcBound || typeof api.on !== 'function') return;
    screenshotEditorIpcBound = true;
    api.on('screenshot-editor:updated', (_event, payload) => {
      const filename = payload?.filename || payload;
      if (!filename) return;
      evictCachedScreenshotUrl(filename);
      const clip = getCurrentClip();
      if (clip) {
        void renderEditorScreenshots(clip);
      }
      refreshClipThumbnails();
    });
    if (isEditorOnly) {
      api.on('screenshot-editor:open', (_event, payload) => {
        const filename = payload?.filename || payload;
        if (!filename) return;
        void openScreenshotEditor(filename);
      });
    }
  };
  const isRowVisible = (row, container) => {
    if (!row || !container) return true;
    const rowRect = row.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    return rowRect.bottom >= containerRect.top && rowRect.top <= containerRect.bottom;
  };

  let thumbnailRefreshFrame = null;
  const scheduleThumbnailRefresh = () => {
    if (thumbnailRefreshFrame) return;
    thumbnailRefreshFrame = window.requestAnimationFrame(() => {
      thumbnailRefreshFrame = null;
      renderClipThumbnails();
    });
  };

  async function renderClipThumbnails() {
    if (!clipList || !clipList.isConnected) return;
    const rows = clipList.querySelectorAll('.clip-row');
    for (const row of rows) {
      if (!isRowVisible(row, clipList)) continue;
      const clipId = row.dataset.clipId;
      const container = row.querySelector('.clip-row__thumb');
      if (!clipId || !container) continue;
      const clip = state.clips.find((item) => item.id === clipId);
      if (!clip) {
        container.innerHTML = '';
        container.dataset.thumbKey = '';
        continue;
      }
      normalizeClipScreenshots(clip);
      const firstShot = (clip.screenshots || [])[0];
      if (!firstShot) {
        container.innerHTML = '';
        container.dataset.thumbKey = '';
        continue;
      }
      if (container.dataset.thumbKey === firstShot) continue;
      const url = await getCachedScreenshotUrl(firstShot);
      if (!url) {
        container.innerHTML = '';
        container.dataset.thumbKey = '';
        continue;
      }
      container.innerHTML = '';
      container.dataset.thumbKey = firstShot;
      const img = document.createElement('img');
      img.className = 'clip-thumbnail';
      img.alt = clip.title || 'Screenshot';
      img.onerror = () => {
        container.innerHTML = '';
        container.dataset.thumbKey = '';
        reportMissingScreenshot(firstShot, 'thumbnail');
      };
      img.src = url;
      container.appendChild(img);
    }
  }

  const updateResponsiveLayout = () => {
    const appRoot = document.getElementById('app');
    if (!appRoot) return;
    const layoutMode = resolveLayoutMode();
    const windowMode = resolveWindowMode();
    appRoot.dataset.layoutMode = layoutMode;
    appRoot.classList.toggle('is-narrow', layoutMode === 'launcher');
    appRoot.classList.toggle('is-medium', layoutMode === 'work');
    appRoot.classList.toggle('is-wide', layoutMode === 'review');
    applyWindowModeLayout(windowMode);
    if (windowMode && windowMode !== lastWindowMode) {
      lastWindowMode = windowMode;
      if (typeof api.requestWindowMode === 'function') {
        void api.requestWindowMode(windowMode);
      }
    }
  };


  function getActiveSectionId() {
    const candidate = state.activeTabId || state.currentSectionId || 'all';
    if (candidate === 'all') return 'all';
    const normalized = normalizeSectionId(candidate);
    const sections = state.sections || [];
    if (!normalized) {
      return sections.length ? resolveFallbackSectionId() : 'all';
    }
    if (sections.length && !sections.some((sec) => sec.id === normalized)) {
      return resolveFallbackSectionId();
    }
    return normalized;
  }

  function getCurrentSection() {
    const sectionId = getActiveSectionId();
    return (state.sections || []).find((sec) => sec.id === sectionId) || null;
  }

  function updateActiveSectionLabel() {
    if (!clipTabNameEl) return;
    const section = getCurrentSection();
    const activeSectionId = getActiveSectionId();
    if (!section) {
      if (activeSectionId === 'all') {
        clipTabNameEl.textContent = 'All';
        if (clipTabPathEl) clipTabPathEl.textContent = '';
      } else {
        clipTabNameEl.textContent = '';
        if (clipTabPathEl) clipTabPathEl.textContent = '';
      }
      return;
    }
    // Sidebar header is derived exclusively from renderer state; avoid patching this from other modules.
    const lockedIconEl = document.createElement('span');
    lockedIconEl.className = 'sidebar-lock-icon';
    lockedIconEl.textContent = section.locked ? '🔒' : '🔓';

    const nameEl = document.createElement('span');
    nameEl.className = 'sidebar-tab-name';
    nameEl.textContent = section.name || section.id || '';

    clipTabNameEl.innerHTML = '';
    clipTabNameEl.appendChild(lockedIconEl);
    clipTabNameEl.appendChild(nameEl);
    if (clipTabPathEl) clipTabPathEl.textContent = section.exportPath || '';
  }

  function refreshSections() {
    syncSectionsFromTabs();
    tabsApi?.renderTabs?.();
    tabsApi?.updateTabCounts?.();
    updateActiveSectionLabel();
    refreshSectionSelect();
  }

  function refreshClipList() {
    const resolvedSection = getActiveSectionId();
    if (resolvedSection !== state.activeTabId) {
      state.activeTabId = resolvedSection;
      state.currentSectionId = resolvedSection;
    }
    const prev = new Map((state.clips || []).map((c) => [c.id, c]));
    clipsApi?.renderClipList?.();
    tabsApi?.updateTabCounts?.();
    // Preserve screenshots on any new clip instances added by renderClipList.
    state.clips = (state.clips || []).map((clip) => {
      if (Array.isArray(clip.screenshots)) return clip;
      const prevClip = prev.get(clip.id);
      if (prevClip && Array.isArray(prevClip.screenshots)) {
        return { ...clip, screenshots: prevClip.screenshots.slice() };
      }
      return clip;
    });
    refreshClipThumbnails();
  }

  function refreshClipThumbnails() {
    void renderClipThumbnails();
  }

  async function refreshEditor() {
    const activeSectionId = getActiveSectionId();
    const clip = resolveClipForSection(activeSectionId);
    if (!clip) {
      state.currentClipId = null;
      editorApi?.loadClipIntoEditor?.(null);
      if (screenshotBox) screenshotBox.innerHTML = '';
      updateEditorControls();
      updateResponsiveLayout();
      return;
    }
    ensureCurrentClipSection(clip);
    state.currentClipId = clip.id;
    if (state.currentSectionId === null || state.currentSectionId === undefined) {
      state.currentSectionId = clip.sectionId;
    }
    refreshSectionSelect();
    editorApi?.loadClipIntoEditor?.(clip);
    const tabSchema = tabsApi?.getActiveTabSchema?.();
    const schema =
      (Array.isArray(tabSchema) && tabSchema.length ? tabSchema : null) ||
      (Array.isArray(clip?.schema) && clip.schema.length ? clip.schema : null) ||
      DEFAULT_SCHEMA;
    editorApi?.applySchemaVisibility?.(schema);
    const allowScreenshots = Array.isArray(schema) ? schema.includes('screenshots') : true;
    if (!allowScreenshots) {
      if (screenshotBox) {
        const row = screenshotBox.closest('.field-row');
        if (row) row.style.display = 'none';
        screenshotBox.innerHTML = '';
      }
    } else if (!manualClipSelection) {
      if (screenshotBox) {
        const row = screenshotBox.closest('.field-row');
        if (row) row.style.display = '';
        screenshotBox.innerHTML = '';
      }
    } else {
      if (screenshotBox) {
        const row = screenshotBox.closest('.field-row');
        if (row) row.style.display = '';
      }
      await renderEditorScreenshots(clip);
    }
    updateEditorControls();
    updateResponsiveLayout();
  }

  async function handleAddScreenshot() {
    try {
      const clip = getCurrentClip();
      if (!clip) return;
      const displays = await api.listDisplays?.();
      if (!Array.isArray(displays) || displays.length === 0) return;
      const display = displays[0];
      const shot = await api.captureScreen?.(display?.id);
      const captures = Array.isArray(shot?.screenshots)
        ? shot.screenshots
        : shot?.dataUrl
        ? [{ dataUrl: shot.dataUrl, filename: shot.filename }]
        : [];
      if (!captures.length) return;
      const payload = captures
        .map((item) => ({
          dataUrl: item?.dataUrl,
          filename: item?.filename,
        }))
        .filter((item) => item.dataUrl);
      if (!payload.length) return;
      const savedFiles = await api.saveScreenshot?.(payload);
      const filenames =
        Array.isArray(savedFiles) && savedFiles.length
          ? savedFiles
              .map((item) => (item && typeof item.filename === 'string' ? item.filename : null))
              .filter(Boolean)
          : [];
      if (!filenames.length) return;
      clip.screenshots = Array.isArray(clip.screenshots) ? clip.screenshots : [];
      clip.screenshots.push(...filenames);
      normalizeClipScreenshots(clip);
      await api.saveClip?.(clip, { mirror: false });
      manualClipSelection = true;
      await refreshFull(clip.id);
    } catch (err) {
      console.error('Add screenshot failed', err);
      window.SnipToast?.show?.('Failed to add screenshot');
    }
  }

  const resolveNewClipSectionId = () => {
    const candidates = [getActiveSectionId(), state.currentSectionId, state.activeTabId];
    for (const candidate of candidates) {
      const normalized = normalizeSectionId(candidate);
      if (normalized) return normalized;
    }
    return resolveFallbackSectionId();
  };

  const readClipboardText = async () => {
    try {
      if (typeof api.getClipboardText === 'function') {
        const value = await api.getClipboardText();
        if (typeof value === 'string') return sanitizeExternalText(value);
      }
    } catch (err) {
      console.warn('Clipboard read via IPC failed', err);
    }
    try {
      if (navigator?.clipboard?.readText) {
        const value = await navigator.clipboard.readText();
        if (typeof value === 'string') return sanitizeExternalText(value);
      }
    } catch (err) {
      console.warn('Clipboard read via navigator failed', err);
    }
    return '';
  };

  async function createNewClip() {
    const sectionId = resolveNewClipSectionId();
    const clipboardText = await readClipboardText();
    const title = normalizeClipTitle('');
    const clip = {
      title,
      text: clipboardText,
      notes: '',
      tags: [],
      screenshots: [],
      sectionId,
      capturedAt: Date.now(),
    };
    try {
      const saved = (await api.saveClip?.(clip, { mirror: false })) || clip;
      const clipId = saved?.id || clip.id;
      if (!clipId) return;
      await refreshFull(clipId);
    } catch (err) {
      console.error('Create new clip failed', err);
    }
  }

  const sectionTabs = document.getElementById('sectionTabs');
  const addTabBtn = document.getElementById('addTabBtn');
  const clipList = document.getElementById('clipList');
  const sectionSelect = document.getElementById('sectionSelect');
  if (sectionSelect) {
    sectionSelect.remove();
  }
  const clipTabNameEl = document.getElementById('clipTabName');
  const clipTabPathEl = document.getElementById('clipTabPath');

  const titleInput = document.getElementById('titleInput');
  const textInput = document.getElementById('textInput');
  const notesInput = document.getElementById('notesInput');
  const tagsInput = document.getElementById('tagsInput');
  const capturedAtInput = document.getElementById('capturedAtInput');
  const capturedAtInputs = Array.from(document.querySelectorAll('#capturedAtInput'));
  if (capturedAtInputs.length > 1) {
    capturedAtInputs.slice(1).forEach((node) => {
      const parentRow = node.closest('.field-row');
      if (parentRow && parentRow.parentNode) {
        parentRow.parentNode.removeChild(parentRow);
      } else if (node.parentNode) {
        node.parentNode.removeChild(node);
      }
    });
  }
  const sourceUrlInput = document.getElementById('sourceUrlInput');
  const sourceTitleInput = document.getElementById('sourceTitleInput');
  const openSourceBtn = document.getElementById('openSourceBtn');
  const screenshotBox = document.getElementById('screenshotContainer');
  if (screenshotBox) screenshotBox.classList.add('screenshots-container');

  const saveClipBtn = document.getElementById('saveClipBtn');
  const deleteClipBtn = document.getElementById('deleteClipBtn');
  const addShotBtn = document.getElementById('addShotBtn');
  const listAddBtn = document.getElementById('listAddBtn');
  const themeToggleBtn = document.getElementById('themeToggleBtn');

  const searchInput = document.getElementById('searchInput');
  const tagFilterInput = document.getElementById('tagFilterInput');
  const sortMenu = document.getElementById('sortMenu');
  const filterMenu = document.getElementById('filterMenu');
  const sortToggleBtn = document.getElementById('sortToggleBtn');
  const filterToggleBtn = document.getElementById('filterToggleBtn');
  const filterApplyBtn = document.getElementById('filterApplyBtn');
  const filterClearBtn = document.getElementById('filterClearBtn');

  const THEME_STORAGE_KEY = 'snipboard.theme';
  const applyTheme = (mode) => {
    const isLight = mode === 'light';
    document.body.classList.toggle('theme-light', isLight);
    if (themeToggleBtn) {
      themeToggleBtn.textContent = isLight ? 'Dark Mode' : 'Light Mode';
    }
  };
  if (themeToggleBtn) {
    let initialTheme = 'dark';
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      if (stored === 'light' || stored === 'dark') {
        initialTheme = stored;
      }
    } catch (err) {
      void err;
    }
    applyTheme(initialTheme);
    themeToggleBtn.addEventListener('click', () => {
      const nextTheme = document.body.classList.contains('theme-light')
        ? 'dark'
        : 'light';
      try {
        localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
      } catch (err) {
        void err;
      }
      applyTheme(nextTheme);
    });
  }

  function persistClipAppearance(entity, patch = {}) {
    if (!entity || !entity.id) return;
    const sanitized = sanitizeAppearancePatch(patch);
    if (typeof entity.sectionId === 'string') {
      const clip = { ...entity, ...sanitized };
      return api
        .saveClip?.(clip, { mirror: false })
        .then((saved) => {
          if (saved) {
            const normalized = sanitizeClipData(normalizeClip(saved));
            const idx = (state.clips || []).findIndex((item) => item.id === saved.id);
            if (idx !== -1) {
              state.clips[idx] = normalized;
            } else {
              state.clips.push(normalized);
            }
          }
          refreshClipList();
          void refreshEditor();
        })
        .catch((err) => {
          console.error('Persist clip appearance failed', err);
          window.SnipToast?.show?.('Failed to save appearance');
        });
    }
    return safeInvoke?.(CHANNELS.UPDATE_SECTION, { id: entity.id, patch: sanitized })
      .then((result) => {
        if (!result?.ok) return;
        const tab = (state.tabs || []).find((item) => item.id === entity.id);
        if (tab) Object.assign(tab, sanitized);
        syncSectionsFromTabs();
        refreshSections();
        refreshClipList();
      })
      .catch((err) => {
        console.error('Persist clip appearance failed', err);
        window.SnipToast?.show?.('Failed to save appearance');
      });
  }

  const updateSection = (id, patch) =>
    safeChannel?.(CHANNELS.UPDATE_SECTION, { id, patch });

  const renderSectionsBar = () => tabsApi?.renderTabs?.();

  const scheduleSaveTabsConfig = async () => {
    try {
      const payload = {
        tabs: state.tabs || [],
        activeTabId: state.activeTabId || 'all',
      };
      await safeChannel?.(CHANNELS.SAVE_TABS, payload);
    } catch (err) {
      console.warn('Schedule save tabs config failed', err);
    }
  };

  const modalsApi = initModals
    ? initModals({
        state,
        ipc: { CHANNELS, invoke, safeInvoke },
        dom: {},
        helpers: {
          persistClipAppearance,
          updateSection,
          renderSectionsBar,
          renderTabs: () => tabsApi?.renderTabs?.(),
          scheduleSaveTabsConfig,
          closeQuickMenus: () => {},
          commitRename: () => {},
          cancelRename: () => {},
        },
      })
    : null;

  const tabsApi = initTabs
    ? initTabs({
        state,
        ipc: { CHANNELS, invoke, safeInvoke },
        dom: { sectionTabs, addTabBtn },
      })
    : null;

  const clipsApi = initClips
    ? initClips({
        state,
        ipc: { CHANNELS, invoke, safeInvoke },
        dom: { clipListContainer: clipList },
      })
    : null;

  const editorApi = initEditor
    ? initEditor({
        state,
        ipc: { CHANNELS, invoke, safeInvoke },
        dom: {
          titleInput,
          textInput,
          notesInput,
          tagsInput,
          capturedAtInput,
          sourceUrlInput,
          sourceTitleInput,
          openSourceBtn,
          screenshotBox,
        },
        helpers: {
          normalizeClip,
          DEFAULT_SCHEMA,
          validateUrl,
          openConfirmModal: modalsApi?.openConfirmModal,
        },
      })
    : null;

  if (tabsApi?.setEditorApi) tabsApi.setEditorApi(editorApi);
  if (clipsApi?.setEditorApi) clipsApi.setEditorApi(editorApi);
  if (tabsApi?.setModalsApi) tabsApi.setModalsApi(modalsApi);
  if (clipsApi?.setModalsApi) clipsApi.setModalsApi(modalsApi);

  tabsApi?.onTabChange?.((tab) => {
    clearScreenshotUrlCache();
    missingScreenshotSet.clear();
    manualClipSelection = false;
    state.currentClipId = null;
    state.activeTabId = tab?.id || 'all';
    state.currentSectionId = state.activeTabId;
    refreshSections();
    refreshClipList();
    refreshClipThumbnails();
    if (screenshotBox) screenshotBox.innerHTML = '';
    void refreshEditor();
  });

  clipsApi?.onClipSelected?.((clip, meta = {}) => {
    clearScreenshotUrlCache();
    manualClipSelection = true;
    void meta;
    state.currentClipId = clip?.id || null;
    refreshClipList();
    void refreshEditor();
  });

  const computeSignature = (clips = []) =>
    clips
      .map((clip) => `${clip.id}:${clip.updatedAt || clip.capturedAt || ''}`)
      .join('|');

  let lastSignature = '';

  const hydrateState = (payload = {}, selectedSectionId) => {
    const prevById = new Map((state.clips || []).map((clip) => [clip.id, clip]));
    const prevActive = selectedSectionId || state.activeTabId || state.currentSectionId;
    const prevClip = state.currentClipId;
    state.clips = (payload.clips || state.clips || [])
      .map((clip) => {
        const normalized = normalizeClip(clip);
        if (!Array.isArray(normalized.screenshots)) {
          const prev = prevById.get(normalized.id);
          if (prev && Array.isArray(prev.screenshots)) {
            normalized.screenshots = prev.screenshots.slice();
          }
        }
        return sanitizeClipData(normalized);
      });
    state.tabs = payload.tabs || state.tabs;
    const tabsList = state.tabs || [];
    const targetSection = selectedSectionId || prevActive;
    const hasPrev = tabsList.some((t) => t.id === targetSection);
    state.activeTabId =
      (hasPrev && targetSection) ||
      state.activeTabId ||
      payload.activeTabId ||
      tabsList[0]?.id ||
      'all';
    state.currentSectionId = state.activeTabId;
    state.searchIndex = updateSearchIndex(state.clips);
    lastSignature = computeSignature(state.clips);

    const activeSectionId = getActiveSectionId();
    const clips = state.clips || [];
    let nextClip = null;
    if (prevClip) {
      const prevClipObj = clips.find((c) => c.id === prevClip);
      if (prevClipObj && (activeSectionId === 'all' || prevClipObj.sectionId === activeSectionId)) {
        nextClip = prevClipObj;
      }
    }
    if (!nextClip) {
      nextClip = resolveClipForSection(activeSectionId);
    }
    state.currentClipId = nextClip ? nextClip.id : null;
    syncSectionsFromTabs();
    refreshSectionSelect();
  };

  const renderAll = () => {
    refreshSections();
    refreshClipList();
    void refreshEditor();
  };

  const refreshFull = (selectedClipId, selectedSectionId) => {
    // Single authoritative full refresh; preserves selection while hydrating from backend state.
    refreshFullQueue = refreshFullQueue.then(async () => {
      try {
        if (selectedClipId) {
          state.currentClipId = selectedClipId;
        }
        const targetSectionId =
          selectedSectionId || state.activeTabId || state.currentSectionId || 'all';
        const data = await api.getData?.();
        const tabsConfig = await safeChannel(CHANNELS.LOAD_TABS);
        const normalizedTabs = applySectionExportPaths(
          normalizeTabs(tabsConfig?.tabs || state.tabs),
          data?.sections
        );
        const sanitizedTabs = sanitizeTabsState(
          normalizedTabs,
          tabsConfig?.activeTabId || state.activeTabId
        );
        if (sanitizedTabs.changed && typeof safeChannel === 'function') {
          safeChannel(CHANNELS.SAVE_TABS, {
            tabs: sanitizedTabs.tabs,
            activeTabId: sanitizedTabs.activeTabId,
          }).catch((err) => {
            console.warn('Failed to save sanitized tabs', err);
          });
        }
        const nextSignature = computeSignature(data?.clips || []);
        if (nextSignature !== lastSignature) {
          clearScreenshotUrlCache();
        }
        hydrateState({
          clips: data?.clips,
          tabs: sanitizedTabs.tabs,
          activeTabId: sanitizedTabs.activeTabId,
        }, targetSectionId);
        if (selectedClipId) {
          const exists = (state.clips || []).some((clip) => clip.id === selectedClipId);
          if (exists) {
            state.currentClipId = selectedClipId;
          }
        }
        renderAll();
      } catch (err) {
        console.warn('Refresh full failed', err);
      } finally {
        updateEditorControls();
      }
    });
    refreshFullQueue = refreshFullQueue.catch(() => {});
    return refreshFullQueue;
  };

  window.SnipRenderer = {
    refreshSections,
    refreshClipList,
    refreshEditor,
    refreshClipThumbnails,
    updateActiveSectionLabel,
    getCurrentSection,
    getActiveSectionId,
    refreshFull,
    isSectionLocked: isCurrentSectionLocked,
  };

  const REFRESH_EVENT = 'snipboard:refresh-data';
  async function refreshClip(id) {
    if (!id) return;
    try {
      const payload = await safeChannel(CHANNELS.GET_DATA);
      const rawClip = (payload?.clips || []).find((item) => item.id === id);
      if (!rawClip) {
        state.clips = (state.clips || []).filter((item) => item.id !== id);
      } else {
      const normalized = sanitizeClipData(normalizeClip(rawClip));
        const idx = (state.clips || []).findIndex((item) => item.id === id);
        if (idx !== -1) {
          state.clips[idx] = normalized;
        } else {
          state.clips.push(normalized);
        }
        if (state.currentClipId === id) {
          await refreshEditor();
        }
      }
      refreshClipList();
    } catch (err) {
      console.warn('Refresh clip failed', err);
    }
  }

  async function refreshSectionsFromBackend() {
    try {
      const tabsConfig = await safeChannel(CHANNELS.LOAD_TABS);
      const data = await api.getData?.();
      const normalizedTabs = applySectionExportPaths(
        normalizeTabs(tabsConfig?.tabs || state.tabs),
        data?.sections
      );
      const sanitizedTabs = sanitizeTabsState(
        normalizedTabs,
        tabsConfig?.activeTabId || state.activeTabId
      );
      if (sanitizedTabs.changed && typeof safeChannel === 'function') {
        safeChannel(CHANNELS.SAVE_TABS, {
          tabs: sanitizedTabs.tabs,
          activeTabId: sanitizedTabs.activeTabId,
        }).catch((err) => {
          console.warn('Failed to save sanitized tabs', err);
        });
      }
      state.tabs = sanitizedTabs.tabs;
      state.activeTabId = sanitizedTabs.activeTabId || state.activeTabId;
      refreshSections();
      refreshClipList();
    } catch (err) {
      console.warn('Refresh sections failed', err);
    }
  }

  document.addEventListener(REFRESH_EVENT, (event) => {
    const detail = event?.detail || {};
    if (detail?.type === 'clip' && detail?.id) {
      void refreshClip(detail.id);
      return;
    }
    if (detail?.type === 'section') {
      void refreshSectionsFromBackend();
      return;
    }
    void refreshFull();
  });

  const SECTIONS_UPDATED_EVENT = 'snipboard:sections-updated';
  document.addEventListener(SECTIONS_UPDATED_EVENT, () => {
    syncSectionsFromTabs();
    refreshSectionSelect();
  });

  const POLL_BASE_MS = 3000;
  const POLL_MAX_MS = 15000;
  let pollDelayMs = POLL_BASE_MS;
  let pollTimer = null;
  let pollPaused = false;
  let pollInitialized = false;

  const shouldPausePolling = () => {
    if (document.hidden) return true;
    if (typeof document.hasFocus === 'function' && !document.hasFocus()) return true;
    return false;
  };

  const clearPollTimer = () => {
    if (pollTimer) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
  };

  const schedulePoll = () => {
    clearPollTimer();
    pollTimer = setTimeout(runPoll, pollDelayMs);
  };

  const updatePollPauseState = () => {
    const nextPaused = shouldPausePolling();
    if (nextPaused) {
      pollPaused = true;
      clearPollTimer();
      return;
    }
    if (!pollPaused && pollTimer) return;
    pollPaused = false;
    pollDelayMs = POLL_BASE_MS;
    schedulePoll();
  };

  const runPoll = async () => {
    if (pollPaused) return;
    try {
      const payload = await safeChannel(CHANNELS.GET_DATA);
      const signature = computeSignature(payload?.clips || []);
      if (signature !== lastSignature) {
        clearScreenshotUrlCache();
        hydrateState({ clips: payload?.clips });
        renderAll();
        pollDelayMs = POLL_BASE_MS;
      } else {
        pollDelayMs = Math.min(POLL_MAX_MS, Math.round(pollDelayMs * 1.5));
      }
    } catch (err) {
      console.warn('Poll failed', err);
      pollDelayMs = Math.min(POLL_MAX_MS, Math.round(pollDelayMs * 1.5));
    } finally {
      if (!pollPaused) schedulePoll();
    }
  };

  const pollBackend = () => {
    if (pollInitialized) return;
    pollInitialized = true;
    pollPaused = shouldPausePolling();
    document.addEventListener('visibilitychange', updatePollPauseState);
    window.addEventListener('focus', updatePollPauseState);
    window.addEventListener('blur', updatePollPauseState);
    if (!pollPaused) {
      pollDelayMs = POLL_BASE_MS;
      schedulePoll();
    }
  };

  const bindToolbar = () => {
    if (saveClipBtn) {
      saveClipBtn.addEventListener('click', () => editorApi?.saveClip?.());
    }
    if (deleteClipBtn) {
      deleteClipBtn.addEventListener('click', () => editorApi?.deleteClip?.());
    }
    if (addShotBtn) {
      addShotBtn.onclick = async () => {
        await handleAddScreenshot();
      };
    }
    if (listAddBtn) {
      listAddBtn.onclick = async () => {
        await createNewClip();
      };
    }
  };

  const bindFilters = () => {
    const closeMenus = () => {
      if (sortMenu) sortMenu.classList.remove('is-open');
      if (filterMenu) filterMenu.classList.remove('is-open');
    };

    if (searchInput) {
      searchInput.addEventListener('input', () => {
        const value = searchInput.value.trim();
        state.searchQuery = value;
        state.searchText = value;
        clipsApi?.renderClipList?.();
      });
    }

    const applyTagFilter = () => {
      const value = tagFilterInput ? tagFilterInput.value.trim() : '';
      state.tagFilter = value;
      clipsApi?.renderClipList?.();
    };

    if (tagFilterInput) {
      tagFilterInput.addEventListener('input', applyTagFilter);
    }

    const handleSortChange = (value) => {
      state.sortMode = value || 'default';
      const selected = sortMenu?.querySelector(
        `input[name="sortMode"][value="${state.sortMode}"]`
      );
      if (selected) selected.checked = true;
      clipsApi?.renderClipList?.();
    };

    if (sortMenu) {
      const radios = Array.from(sortMenu.querySelectorAll('input[name="sortMode"]'));
      radios.forEach((radio) => {
        radio.addEventListener('change', () => {
          handleSortChange(radio.value);
          closeMenus();
        });
      });
      const initial = radios.find((radio) => radio.value === (state.sortMode || 'default')) || radios[0];
      if (initial) initial.checked = true;
    }

    if (filterApplyBtn) {
      filterApplyBtn.addEventListener('click', () => {
        applyTagFilter();
        closeMenus();
      });
    }

    if (filterClearBtn) {
      filterClearBtn.addEventListener('click', () => {
        if (tagFilterInput) tagFilterInput.value = '';
        state.tagFilter = '';
        clipsApi?.renderClipList?.();
        closeMenus();
      });
    }

    if (sortToggleBtn && sortMenu) {
      sortToggleBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        const willOpen = !sortMenu.classList.contains('is-open');
        closeMenus();
        if (willOpen) sortMenu.classList.add('is-open');
      });
    }

    if (filterToggleBtn && filterMenu) {
      filterToggleBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        const willOpen = !filterMenu.classList.contains('is-open');
        closeMenus();
        if (willOpen) filterMenu.classList.add('is-open');
      });
    }

    if (document) {
      document.addEventListener('click', (event) => {
        const target = event.target;
        const inSortMenu = sortMenu && (sortMenu === target || sortMenu.contains(target));
        const inFilterMenu = filterMenu && (filterMenu === target || filterMenu.contains(target));
        const onToggle =
          (sortToggleBtn && (sortToggleBtn === target || sortToggleBtn.contains(target))) ||
          (filterToggleBtn && (filterToggleBtn === target || filterToggleBtn.contains(target)));
        if (!inSortMenu && !inFilterMenu && !onToggle) {
          closeMenus();
        }
      });
    }
  };

  let thumbnailListenersBound = false;
  const bindThumbnailLazyLoad = () => {
    if (!clipList || thumbnailListenersBound) return;
    clipList.addEventListener('scroll', scheduleThumbnailRefresh);
    window.addEventListener('resize', scheduleThumbnailRefresh);
    thumbnailListenersBound = true;
  };

  const initEditorWindow = async () => {
    bindScreenshotEditorIpc();
    document.body.classList.add('editor-only');
    if (initialEditorFilename) {
      await openScreenshotEditor(initialEditorFilename);
    }
  };

  const init = async () => {
    updateResponsiveLayout();
    await refreshFull();
    bindToolbar();
    bindFilters();
    bindThumbnailLazyLoad();
    bindScreenshotEditorIpc();
    updateResponsiveLayout();
    window.addEventListener('resize', updateResponsiveLayout);
    editorApi?.bindEditorEvents?.();
    pollBackend();
  };

  let hasInitialized = false;
  const start = () => {
    if (hasInitialized) return;
    hasInitialized = true;
    if (isEditorOnly) {
      void initEditorWindow();
      return;
    }
    init();
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
