(function (global) {
  function initEditor({ state = {}, dom = {}, ipc = {}, helpers = {} } = {}) {
    const app = state;
    const getRendererApi = () => global.SnipRenderer || {};
    const callRefreshClipList = () => getRendererApi().refreshClipList?.();
    const callRefreshEditor = () => getRendererApi().refreshEditor?.();
    const {
      textInput,
      titleInput,
      notesInput,
      tagsInput,
      capturedAtInput,
      sourceUrlInput,
      sourceTitleInput,
      openSourceBtn,
      saveClipBtn,
      deleteClipBtn,
    } = dom;

    const { CHANNELS = {}, safeInvoke, invoke } = ipc;
    const executor = safeInvoke || invoke || (async () => {});
    const {
      validateText = (value) => (value || '').slice(0, 1000),
      validateUrl = (value) => value || '',
      DEFAULT_SCHEMA = [],
      openConfirmModal = null,
    } = helpers;
    // eslint-disable-next-line no-control-regex -- strip null bytes from external input.
    const sanitizeExternalText = (value) => (typeof value === 'string' ? value.replace(/\u0000/g, '') : '');
    const NOTE_SAVE_DEBOUNCE_MS = 400;
    let noteSaveTimer = null;
    let noteSavePending = false;
    let beforeUnloadBound = false;

    const getCurrentClip = () => (app.clips || []).find((clip) => clip.id === app.currentClipId) || null;
    const isSectionLocked = () => {
      const renderer = getRendererApi();
      return renderer?.isSectionLocked?.() || false;
    };
    const confirmDelete = async (message) => {
      if (typeof openConfirmModal === 'function') {
        return openConfirmModal(message);
      }
      if (typeof global.confirm === 'function') {
        return global.confirm(message);
      }
      return false;
    };
    const getWrapper = (element) => (element && typeof element.closest === 'function' ? element.closest('div') : null);

    const removeSourceUrlField = () => {
      if (!sourceUrlInput) return;
      const group = sourceUrlInput.closest && sourceUrlInput.closest('.source-url-group');
      const label = group ? group.querySelector('label') : null;
      if (label) label.remove();
      if (sourceUrlInput.remove) {
        sourceUrlInput.remove();
      } else if (sourceUrlInput.parentElement) {
        sourceUrlInput.parentElement.removeChild(sourceUrlInput);
      }
    };

    let currentClipSourceUrl = '';
    let openVisible = false;
    const hasValidSourceUrl = () => Boolean(validateUrl(currentClipSourceUrl || ''));
    const openWrapper = openSourceBtn
      ? (openSourceBtn.closest && openSourceBtn.closest('.source-url-group')) || openSourceBtn.parentElement
      : null;
    const setOpenButtonVisibility = (show) => {
      openVisible = Boolean(show);
      if (openWrapper) openWrapper.style.display = show ? '' : 'none';
      if (openSourceBtn) openSourceBtn.style.display = show ? '' : 'none';
      if (openSourceBtn) openSourceBtn.disabled = !show || !hasValidSourceUrl();
    };
    const syncCurrentSourceUrl = (value) => {
      currentClipSourceUrl = value || '';
      if (openSourceBtn && openVisible) {
        openSourceBtn.disabled = !hasValidSourceUrl();
      }
    };
    const getStoredSourceUrl = () => getCurrentClip()?.sourceUrl || '';

    removeSourceUrlField();

    const applySchemaVisibility = (schema) => {
      const normalized = Array.isArray(schema) && schema.length ? schema : DEFAULT_SCHEMA;
      // Support case differences (e.g., SourceUrl/SourceTitle) without altering schema keys.
      const schemaSet = new Set(normalized);
      const schemaLower = new Set(normalized.map((f) => (typeof f === 'string' ? f.toLowerCase() : f)));
      const matches = (field) => schemaSet.has(field) || schemaLower.has(field.toLowerCase());
      const toggle = (element, field) => {
        if (!element) return;
        element.style.display = matches(field) ? '' : 'none';
      };
      toggle(getWrapper(titleInput), 'title');
      toggle(getWrapper(textInput), 'text');
      toggle(getWrapper(notesInput), 'notes');
      toggle(getWrapper(tagsInput), 'tags');
      toggle(getWrapper(capturedAtInput), 'capturedAt');
      const sourceTitleWrapper =
        (sourceTitleInput && sourceTitleInput.closest && sourceTitleInput.closest('.source-title-group')) ||
        (sourceTitleInput ? sourceTitleInput.parentElement : null);
      const shouldShowTitle = matches('sourceTitle');
      toggle(sourceTitleWrapper, 'sourceTitle');
      const shouldShowOpen = matches('open');
      setOpenButtonVisibility(shouldShowOpen);
      const sourceRow =
        (openSourceBtn && openSourceBtn.closest && openSourceBtn.closest('.source-meta-row')) ||
        (sourceTitleInput && sourceTitleInput.closest && sourceTitleInput.closest('.source-meta-row')) ||
        null;
      if (sourceRow) {
        sourceRow.style.display = shouldShowTitle ? '' : 'none';
      }
    };

    const normalizeTags = (input) => {
      if (Array.isArray(input)) {
        return input
          .map((tag) => (tag ? String(tag).trim() : ''))
          .filter(Boolean);
      }
      if (typeof input === 'string') {
        return input
          .split(',')
          .map((tag) => (tag ? tag.trim() : ''))
          .filter(Boolean);
      }
      return [];
    };

    const ensureScreenshots = (clip) => {
      if (!clip) return [];
      if (!Array.isArray(clip.screenshots)) {
        clip.screenshots = [];
      }
      clip.screenshots = clip.screenshots
        .map((shot) => (shot ? String(shot).trim() : ''))
        .filter(Boolean);
      return clip.screenshots;
    };

    const getEditorFieldValues = () => {
      const rawTags = tagsInput && tagsInput.value ? tagsInput.value : '';
      return {
        title: validateText(titleInput && titleInput.value ? titleInput.value : ''),
        text: validateText(textInput && textInput.value ? textInput.value : ''),
        notes: validateText(notesInput && notesInput.value ? notesInput.value : ''),
        tags: normalizeTags(rawTags),
        capturedAt: capturedAtInput && capturedAtInput.value ? capturedAtInput.value : '',
        sourceUrl: getStoredSourceUrl(),
        sourceTitle: validateText(sourceTitleInput && sourceTitleInput.value ? sourceTitleInput.value : ''),
      };
    };

    const loadClipIntoEditor = (clip) => {
      const target = clip || getCurrentClip();
      if (!target) {
        [titleInput, textInput, notesInput, tagsInput, capturedAtInput, sourceUrlInput, sourceTitleInput].forEach((el) => {
          if (el) el.value = '';
        });
        syncCurrentSourceUrl('');
        return;
      }
      if (titleInput) titleInput.value = target.title || '';
      if (textInput) textInput.value = target.text || '';
      if (notesInput) notesInput.value = target.notes || '';
      if (tagsInput) {
        const normalizedTags = normalizeTags(target.tags);
        tagsInput.value = normalizedTags.join(', ');
      }
      if (capturedAtInput) capturedAtInput.value = target.capturedAt ? new Date(target.capturedAt).toISOString().slice(0, 16) : '';
      syncCurrentSourceUrl(target.sourceUrl || '');
      if (sourceTitleInput) sourceTitleInput.value = target.sourceTitle || '';
      applySchemaVisibility(target.schema || []);
    };

    const showToast = (message) => {
      if (!message) return;
      if (global.SnipToast && typeof global.SnipToast.show === 'function') {
        global.SnipToast.show(message);
        return;
      }
      const toast = document.createElement('div');
      toast.className = 'sb-toast';
      toast.textContent = message;
      document.body.appendChild(toast);
      setTimeout(() => {
        toast.remove();
      }, 2000);
    };

    const saveClip = async ({ silent = false } = {}) => {
      if (!silent && noteSaveTimer) {
        clearTimeout(noteSaveTimer);
        noteSaveTimer = null;
        noteSavePending = false;
      }
      const clip = getCurrentClip();
      if (!clip) {
        if (!silent) showToast('No clip selected.');
        return;
      }
      const values = getEditorFieldValues();
      const normalizedTitle = String(values.title || '').trim();
      values.title = normalizedTitle || 'Untitled';
      const tagsArray = normalizeTags(values.tags);
      values.tags = tagsArray;
      clip.title = String(values.title || '');
      clip.text = String(values.text || '');
      clip.notes = String(values.notes || '');
      clip.tags = values.tags;
      ensureScreenshots(clip);
      Object.assign(clip, values);
      try {
        await executor(CHANNELS.SAVE_CLIP, clip);
        if (!silent) {
          showToast('Clip saved.');
          loadClipIntoEditor(clip);
          callRefreshClipList();
          callRefreshEditor();
        }
      } catch (err) {
        console.error('[SnipEditor] saveClip failed', err);
        if (!silent) showToast('Failed to save clip.');
      }
    };

    const flushNoteSave = () => {
      if (noteSaveTimer) {
        clearTimeout(noteSaveTimer);
        noteSaveTimer = null;
      }
      if (!noteSavePending) return;
      noteSavePending = false;
      saveClip({ silent: true });
    };

    const scheduleNoteSave = () => {
      if (!notesInput) return;
      if (noteSaveTimer) clearTimeout(noteSaveTimer);
      noteSavePending = true;
      noteSaveTimer = setTimeout(() => {
        noteSaveTimer = null;
        if (!noteSavePending) return;
        noteSavePending = false;
        saveClip({ silent: true });
      }, NOTE_SAVE_DEBOUNCE_MS);
    };

    const deleteClip = async () => {
      const selectedIds =
        app.selectedClipIds instanceof Set ? Array.from(app.selectedClipIds) : [];
      if (selectedIds.length > 1) {
        if (isSectionLocked()) {
          showToast('Tab is locked: cannot delete clips.');
          return;
        }
        const confirmed = await confirmDelete(`Delete ${selectedIds.length} selected clips?`);
        if (!confirmed) return;
        try {
          const deleteClips = global.api?.deleteClips;
          if (typeof deleteClips !== 'function') {
            showToast('Failed to delete clips.');
            return;
          }
          const result = await deleteClips(selectedIds);
          const blocked = Array.isArray(result?.blocked) ? result.blocked : [];
          const blockedSet = new Set(blocked);
          const removedIds = selectedIds.filter((id) => !blockedSet.has(id));
          if (removedIds.length) {
            app.clips = (app.clips || []).filter((item) => !removedIds.includes(item.id));
          }
          if (app.selectedClipIds instanceof Set) {
            app.selectedClipIds.clear();
          }
          if (removedIds.includes(app.currentClipId)) {
            app.currentClipId = null;
            loadClipIntoEditor(null);
          }
          callRefreshClipList();
          callRefreshEditor();
        } catch (err) {
          console.error('[SnipEditor] deleteClips failed', err);
          showToast('Failed to delete clips.');
        }
        return;
      }

      const clip = getCurrentClip();
      if (!clip) {
        showToast('No clip selected.');
        return;
      }
      if (isSectionLocked()) {
        showToast('Tab is locked: cannot delete clips.');
        return;
      }
      try {
        const deleteChannel = CHANNELS.DELETE_CLIP || 'delete-clip';
        await executor(deleteChannel, clip.id);
        showToast('Clip deleted.');
        app.clips = (app.clips || []).filter((item) => item.id !== clip.id);
        if (app.selectedClipIds instanceof Set) {
          app.selectedClipIds.delete(clip.id);
        }
        app.currentClipId = null;
        loadClipIntoEditor(null);
        callRefreshClipList();
        callRefreshEditor();
      } catch (err) {
        console.error('[SnipEditor] deleteClip failed', err);
        showToast('Failed to delete clip.');
      }
    };

    const bindEditorEvents = () => {
      if (saveClipBtn) saveClipBtn.onclick = (event) => {
        event.preventDefault();
        saveClip();
      };
      if (deleteClipBtn) deleteClipBtn.onclick = (event) => {
        event.preventDefault();
        deleteClip();
      };
      if (notesInput) {
        notesInput.addEventListener('input', scheduleNoteSave);
        notesInput.addEventListener('blur', flushNoteSave);
      }
      if (!beforeUnloadBound) {
        beforeUnloadBound = true;
        window.addEventListener('beforeunload', flushNoteSave);
      }
      // Delegated handler for opening source URL; uses stable data-action hook to avoid layout-dependent selectors.
      document.addEventListener('click', (event) => {
        const btn = event.target?.closest?.('[data-action="open-source-url"]');
        if (!btn) return;
        event.preventDefault();
        event.stopPropagation();
        if (global.__snipboardOpenInFlight) return;
        global.__snipboardOpenInFlight = true;
        const url = validateUrl(sanitizeExternalText(getStoredSourceUrl()));
        if (!url) {
          global.__snipboardOpenInFlight = false;
          return;
        }
        if (global.api?.openUrl) {
          global.api.openUrl(url);
        } else if (executor) {
          executor(CHANNELS.OPEN_URL || 'open-url', url);
        }
        setTimeout(() => {
          global.__snipboardOpenInFlight = false;
        }, 300);
      });
      if (textInput) {
        textInput.addEventListener('dragover', (event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'copy';
        });
        textInput.addEventListener('drop', (event) => {
          event.preventDefault();
          const dt = event.dataTransfer;
          const clipId = sanitizeExternalText(dt?.getData('application/x-snipboard-clip-id') || '');
          const clip = (app.clips || []).find((c) => c.id === clipId);
          const titleLine = clip?.title || '(Untitled)';
          const body = sanitizeExternalText(clip?.text || dt?.getData('text/plain') || '');
          const payload = `---\n${titleLine}\n${body}\n---\n`;
          const input = textInput;
          const start = input.selectionStart ?? input.value.length;
          const end = input.selectionEnd ?? input.value.length;
          const before = input.value.slice(0, start);
          const after = input.value.slice(end);
          input.value = `${before}${payload}${after}`;
          const cursor = start + payload.length;
          input.selectionStart = input.selectionEnd = cursor;
          input.focus();
        });
      }
    };

    return {
      loadClipIntoEditor,
      applySchemaVisibility,
      bindEditorEvents,
      getEditorFieldValues,
      saveClip,
      deleteClip,
    };
  }

  global.SnipEditor = { initEditor };
})(window);
