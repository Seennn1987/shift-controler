/**
 * 授業料コース・1対1の切り替え日を残す。
 * changes は [{ from: 'YYYY-MM-DD', before, after }]。from の日から after を使い、それより前は before のまま。
 * 日付がないとき（毎週の枠そのもの）は、いまの設定を使う。
 */
function sortedChanges(changes){
  return (Array.isArray(changes) ? changes : [])
    .filter(c=> c && typeof c.from === 'string')
    .slice()
    .sort((a, b)=> a.from.localeCompare(b.from));
}

export function valueOnDate(changes, current, dateStr){
  const list = sortedChanges(changes);
  if(typeof dateStr !== 'string' || !dateStr || list.length === 0) return current;
  let value = list[0].before;
  for(const c of list){
    if(c.from > dateStr) break;
    value = c.after;
  }
  return value;
}

function valueBefore(changes, current, dateStr){
  const list = sortedChanges(changes);
  if(list.length === 0) return current;
  let value = list[0].before;
  for(const c of list){
    if(c.from >= dateStr) break;
    value = c.after;
  }
  return value;
}

/** from の日から after に変える。from 以降に入っていた切り替えは、この変更で上書きする */
export function recordChange(changes, current, from, after){
  const before = valueBefore(changes, current, from);
  const kept = sortedChanges(changes).filter(c=> c.from < from);
  if(before === after) return kept;
  return [...kept, { from, before, after }];
}
