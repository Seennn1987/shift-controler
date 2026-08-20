/** 読み仮名による並び替え・検索用ユーティリティ */

export function compareNameKana(a, b, getKana, getName){
  const ka = (getKana(a) || '').trim();
  const kb = (getKana(b) || '').trim();
  const aMissing = !ka;
  const bMissing = !kb;
  if(aMissing !== bMissing) return aMissing ? 1 : -1;
  if(ka && kb){
    const cmp = ka.localeCompare(kb, 'ja');
    if(cmp !== 0) return cmp;
  }
  return (getName(a) || '').localeCompare(getName(b) || '', 'ja');
}

export function sortByNameKana(items, getKana, getName){
  return [...items].sort((a, b)=> compareNameKana(a, b, getKana, getName));
}

export function personSearchText(name, nameKana, extra = ''){
  return `${name || ''} ${nameKana || ''} ${extra || ''}`.toLowerCase();
}

export function matchesPersonSearch(query, name, nameKana, extra = ''){
  const q = query.trim().toLowerCase();
  if(!q) return true;
  return personSearchText(name, nameKana, extra).includes(q);
}
