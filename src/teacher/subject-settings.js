import { SUBJECT_MAP, LEVELS_ORDER, LEVEL_ABBR, SUBJECT_ABBR } from '../shared/constants.js';
import { subjectColor } from '../admin/schedule-core.js';
import { fbAuth, fbDb, S } from './state.js';
import { debugLog } from './debug.js';

const STATE_LABEL = { none: '不可', on: '対応可能', preferred: '得意科目' };
const STATE_MARK = { none: '×', on: '○', preferred: '★' };

let draftSubjects = [];

function teacherSubjectsRef(){
  if(!S.myAdminUid || !S.myTeacherId) return null;
  return fbDb.collection('teacherSubjects').doc(`${S.myAdminUid}_${S.myTeacherId}`);
}

function findEntry(list, level, subject){
  return (list || []).find(s => s.level === level && s.subject === subject) || null;
}

function cellState(list, level, subject){
  const entry = findEntry(list, level, subject);
  if(!entry) return 'none';
  return entry.preferred ? 'preferred' : 'on';
}

function cycleState(state){
  if(state === 'none') return 'on';
  if(state === 'on') return 'preferred';
  return 'none';
}

function applyCellState(list, level, subject, state){
  const next = (list || []).filter(s => !(s.level === level && s.subject === subject));
  if(state === 'on') next.push({ level, subject, preferred: false });
  if(state === 'preferred') next.push({ level, subject, preferred: true });
  return next;
}

function buildMatrixHtml(list){
  const head = SUBJECT_MAP['小学'].map(sub => `<th>${SUBJECT_ABBR[sub] || sub.charAt(0)}</th>`).join('');
  const rows = LEVELS_ORDER.map(level => {
    const cells = SUBJECT_MAP[level].map(subject => {
      const state = cellState(list, level, subject);
      const mark = STATE_MARK[state];
      const label = STATE_LABEL[state];
      const btn = `<button type="button" data-level="${level}" data-subject="${subject}" aria-label="${level}${subject} ${label}">${mark}</button>`;
      if(state === 'none') return `<td class="sub-empty">${btn}</td>`;
      const c = subjectColor(level, subject);
      return `<td class="sub-on" style="background:${c.bg};color:${c.text};">${btn}</td>`;
    }).join('');
    return `<tr><th class="subject-matrix-level">${LEVEL_ABBR[level]}</th>${cells}</tr>`;
  }).join('');
  return `<table class="subject-matrix is-editable"><thead><tr><th></th>${head}</tr></thead><tbody>${rows}</tbody></table>`;
}

function isSubjectsViewOpen(){
  const view = document.getElementById('viewSubjects');
  return !!(view && !view.hidden);
}

function bindDraftClicks(wrap){
  wrap.querySelectorAll('button[data-level]').forEach(btn => {
    btn.addEventListener('click', () => {
      const { level, subject } = btn.dataset;
      const next = cycleState(cellState(draftSubjects, level, subject));
      draftSubjects = applyCellState(draftSubjects, level, subject, next);
      wrap.innerHTML = buildMatrixHtml(draftSubjects);
      bindDraftClicks(wrap);
    });
  });
}

function showHome(){
  const home = document.getElementById('viewHome');
  const subjects = document.getElementById('viewSubjects');
  if(home) home.hidden = false;
  if(subjects) subjects.hidden = true;
}

function showSubjects(){
  if(isSubjectsViewOpen()) return;
  draftSubjects = (S.mySubjects || []).map(s => ({ ...s }));
  const msg = document.getElementById('subjectFormMsg');
  if(msg) msg.textContent = '';
  const wrap = document.getElementById('teacherMatrixWrap');
  if(wrap){
    wrap.innerHTML = buildMatrixHtml(draftSubjects);
    bindDraftClicks(wrap);
  }
  const home = document.getElementById('viewHome');
  const subjects = document.getElementById('viewSubjects');
  if(home) home.hidden = true;
  if(subjects) subjects.hidden = false;
  document.getElementById('backToHomeBtn')?.focus();
}

async function saveDraft(){
  const msg = document.getElementById('subjectFormMsg');
  if(draftSubjects.length === 0){
    if(msg) msg.textContent = '対応可能な教科を1つ以上選んでから「変更を保存」を押してください。';
    return;
  }
  const ref = teacherSubjectsRef();
  if(!ref || !fbAuth.currentUser){
    if(msg) msg.textContent = '保存に失敗しました。通信状況をご確認ください。';
    return;
  }
  S.lastLocalSubjectEditAt = Date.now();
  S.mySubjects = draftSubjects.map(s => ({ ...s }));
  try{
    await ref.set({
      adminUid: S.myAdminUid,
      teacherId: S.myTeacherId,
      teacherLoginUid: fbAuth.currentUser.uid,
      subjects: S.mySubjects,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedBy: 'teacher',
    }, { merge: true });
    debugLog('[teacherSubjects] 保存成功');
    if(msg) msg.textContent = '';
    showHome();
  }catch(err){
    debugLog(`[teacherSubjects] 保存失敗 code=${err.code} message=${err.message}`);
    console.error('担当教科の保存エラー:', err);
    if(msg) msg.textContent = '保存に失敗しました。通信状況をご確認ください。';
  }
}

function startTeacherSubjectsListener(){
  if(S.subjectSettingsTimer) clearInterval(S.subjectSettingsTimer);
  const poll = async ()=>{
    const ref = teacherSubjectsRef();
    if(!ref) return;
    try{
      const snap = await ref.get();
      if(Date.now() - (S.lastLocalSubjectEditAt || 0) < 5000) return;
      S.mySubjects = snap.exists ? (snap.data().subjects || []) : [];
    }catch(err){
      debugLog(`[teacherSubjects] 読み込み失敗 code=${err.code} message=${err.message}`);
      console.error('担当教科の読み込みエラー:', err);
    }
  };
  poll();
  S.subjectSettingsTimer = setInterval(poll, 10000);
}

function stopTeacherSubjectsListener(){
  if(S.subjectSettingsTimer){
    clearInterval(S.subjectSettingsTimer);
    S.subjectSettingsTimer = null;
  }
  draftSubjects = [];
  showHome();
}

document.getElementById('openSubjectBtn')?.addEventListener('click', showSubjects);
document.getElementById('backToHomeBtn')?.addEventListener('click', showHome);
document.getElementById('saveSubjectBtn')?.addEventListener('click', ()=>{ saveDraft(); });

export { startTeacherSubjectsListener, stopTeacherSubjectsListener, showHome };
