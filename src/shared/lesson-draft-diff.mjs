/** 仮決めの一覧を、保存の成否と突き合わせる。画面用の計算だけで、通信はしない。 */

function comparable(entry){
  const out = {};
  Object.keys(entry || {}).filter(key => key !== 'adminUid' && key !== 'updatedAt').sort().forEach(key => {
    const value = entry[key];
    out[key] = value === undefined ? null : value;
  });
  return JSON.stringify(out);
}

export function sameDraft(a, b){
  return comparable(a) === comparable(b);
}

export function diffDrafts(before, after){
  const beforeById = new Map();
  (before || []).forEach(entry => {
    if(entry && entry.id) beforeById.set(entry.id, entry);
  });
  const afterById = new Map();
  (after || []).forEach(entry => {
    if(entry && entry.id) afterById.set(entry.id, entry);
  });
  const upserts = [];
  const deleteIds = [];
  afterById.forEach((entry, id) => {
    const prev = beforeById.get(id);
    if(!prev || !sameDraft(prev, entry)) upserts.push(entry);
  });
  beforeById.forEach((entry, id) => {
    if(!afterById.has(id)) deleteIds.push(id);
  });
  return { upserts, deleteIds };
}

/** 保存に失敗したときは、画面を保存前の一覧に戻す */
export function listsAfterDraftSave(before, after, saved){
  return saved ? after : before;
}

export function entryFromStored(data, docId){
  const entry = {};
  if(data && typeof data === 'object'){
    Object.keys(data).forEach(key => {
      if(key === 'adminUid' || key === 'updatedAt') return;
      entry[key] = data[key];
    });
  }
  if(!entry.id) entry.id = docId;
  return entry;
}

/** すでにある仮決めを残し、授業一覧の中にだけある仮決めを足す。どちらも消さない。 */
export function unionDrafts(remote, legacy){
  const byId = new Map();
  const missing = [];
  (remote || []).forEach(entry => {
    if(entry && entry.id) byId.set(entry.id, entry);
  });
  (legacy || []).forEach(entry => {
    if(!entry || !entry.id) return;
    if(!byId.has(entry.id)){
      byId.set(entry.id, entry);
      missing.push(entry);
    }
  });
  return { list: [...byId.values()], missing };
}

/** 確定・承認待ちに移ったものは仮決めとして出さない。承認待ちそのものは消さない。 */
export function mergeDraftsForRead(remote, legacy, assignments, pending){
  const placed = new Set();
  (assignments || []).forEach(entry => { if(entry && entry.id) placed.add(entry.id); });
  (pending || []).forEach(entry => { if(entry && entry.id) placed.add(entry.id); });
  const visibleRemote = (remote || []).filter(entry => entry && entry.id && !placed.has(entry.id));
  const visibleLegacy = (legacy || []).filter(entry => entry && entry.id && !placed.has(entry.id));
  return unionDrafts(visibleRemote, visibleLegacy).list;
}
