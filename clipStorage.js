/* eslint-env node */
function createClipStorage({ readJson, writeJson, clipsFile }) {
  const load = () => readJson(clipsFile, []);
  const save = (clips) => writeJson(clipsFile, clips);
  const deleteByIds = (ids, existingClips) => {
    const list = Array.isArray(existingClips) ? existingClips : load();
    const idList = Array.isArray(ids) ? ids : ids ? [ids] : [];
    const idSet = new Set(idList);
    if (!idSet.size) {
      save(list);
      return { clips: list, removed: [] };
    }
    const removed = [];
    const keep = [];
    for (const clip of list) {
      if (idSet.has(clip.id)) {
        removed.push(clip);
      } else {
        keep.push(clip);
      }
    }
    save(keep);
    return { clips: keep, removed };
  };
  return { load, save, deleteByIds };
}

module.exports = { createClipStorage };
