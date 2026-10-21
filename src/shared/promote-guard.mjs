/** 2教科の確定は、待ちにある授業がその教科を全部含むときだけ進める。教科名では分けない。 */

export function requiredTicketSubjects(ticket){
  if(ticket?.subjects?.length >= 2) return [...new Set(ticket.subjects)];
  return ticket?.subject ? [ticket.subject] : [];
}

export function pendingCoversTicketSubjects(ticket, rows){
  const required = requiredTicketSubjects(ticket);
  const list = rows || [];
  if(required.length >= 2){
    const have = new Set(list.map(row => row.subject));
    return required.every(subject => have.has(subject));
  }
  return list.length > 0;
}

/** 保存が成功したときだけ確定する。2教科は両方が待ちにあるときだけ。 */
export function promoteOutcome(ticket, waiting, saveSucceeded){
  if(!pendingCoversTicketSubjects(ticket, waiting)){
    return { listed: false, promoted: false };
  }
  if(!saveSucceeded) return { listed: false, promoted: false };
  return { listed: true, promoted: true };
}

/** 修正前。1件でも待ちがあれば、保存の前に確定した。 */
export function legacyPromoteOutcome(waiting){
  const go = (waiting || []).length > 0;
  return { listed: go, promoted: go };
}
