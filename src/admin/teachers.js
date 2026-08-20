import { SUBJECT_MAP, DAYS, SLOTS, WEEKDAY_JP, WEEK_FULL } from '../shared/constants.js';
import { HOLIDAYS_JP } from '../shared/holidays.js';
import { pad2, daysInYearMonth, toDateStr, getTodayStr } from '../shared/date-utils.js';
import { firebaseConfig, fbAuth, fbDb, STORAGE_KEY, getSecondaryAuth, S } from './state.js';
import { renderMatrix, switchView } from './finance-ui.js';
import { renderMatching } from './matching.js';
import { fillBaseAvailArea, readBaseAvailArea, renderRaiseScheduleList, subjectColor } from './schedule-core.js';
import { scheduleSave } from './students-persistence.js';






// ---------- データ読み込み（ハードコーディング版：storageは使用しない） ----------
async function loadTeachers(){
  // 実データはloadAppStateFromFirestore()で読み込み済み。ここではフラグだけ立てる
  S.dataReady = true;
}
async function saveTeachers(){
  scheduleSave();
  return true;
}

// ---------- build form UI ----------
function buildSubjectArea(){
  const area = document.getElementById('subjectArea');
  area.innerHTML = '';
  Object.entries(SUBJECT_MAP).forEach(([level, subs])=>{
    const block = document.createElement('div');
    block.className = 'subject-block';
    const label = document.createElement('div');
    label.className = 'level-name';
    label.textContent = level;
    block.appendChild(label);
    const row = document.createElement('div');
    row.className = 'chip-row';
    subs.forEach(sub=>{
      const id = `subj-${level}-${sub}`;
      const c = subjectColor(level, sub);
      const item = document.createElement('span');
      item.className = 'subj-item';
      item.innerHTML = `
        <label class="chip">
          <input type="checkbox" id="${id}" data-level="${level}" data-subject="${sub}">
          <span style="--chip-bg:${c.bg};--chip-text:${c.text};--chip-border:${c.border};">${sub}</span>
        </label>
        <button type="button" class="star-btn" data-level="${level}" data-subject="${sub}" data-preferred="0" disabled title="得意科目にする">☆</button>
      `;
      row.appendChild(item);
    });
    block.appendChild(row);
    area.appendChild(block);
  });

  // チェック状態と★ボタンの連動
  area.querySelectorAll('#subjectArea input[type=checkbox]').forEach(cb=>{
    cb.addEventListener('change', ()=>{
      const star = area.querySelector(`.star-btn[data-level="${cb.dataset.level}"][data-subject="${cb.dataset.subject}"]`);
      if(!star) return;
      star.disabled = !cb.checked;
      if(!cb.checked){
        star.dataset.preferred = '0';
        star.textContent = '☆';
        star.classList.remove('active');
      }
    });
  });
  area.querySelectorAll('.star-btn').forEach(star=>{
    star.addEventListener('click', ()=>{
      if(star.disabled) return;
      const active = star.dataset.preferred === '1';
      star.dataset.preferred = active ? '0' : '1';
      star.textContent = active ? '☆' : '★';
      star.classList.toggle('active', !active);
    });
  });
}

function buildSubjectFilterOptions(){
  const sel = document.getElementById('subjectFilter');
  sel.innerHTML = '<option value="">教科で絞り込み（すべて表示）</option>';
  Object.entries(SUBJECT_MAP).forEach(([level, subs])=>{
    subs.forEach(sub=>{
      const opt = document.createElement('option');
      opt.value = `${level}-${sub}`;
      opt.textContent = `${level}｜${sub}`;
      sel.appendChild(opt);
    });
  });
}

// ---------- form read/write ----------
function resetForm(){
  S.editingId = null;
  document.getElementById('nameInput').value = '';
  document.getElementById('perLessonRateInput').value = '1500';
  document.getElementById('dailyTransportInput').value = '500';
  document.getElementById('teacherNotesInput').value = '';
  document.getElementById('earlyExceptionToggle').checked = false;
  document.getElementById('earlyExceptionArea').style.display = 'none';
  document.getElementById('earlyExceptionCount').value = '';
  document.getElementById('earlyExceptionRate').value = '';
  document.getElementById('raiseScheduleToggle').checked = false;
  document.getElementById('raiseScheduleArea').style.display = 'none';
  S.formRaiseSchedule = [];
  renderRaiseScheduleList();
  document.querySelectorAll('#subjectArea input[type=checkbox]').forEach(cb=>{
    cb.checked = false;
    cb.dispatchEvent(new Event('change'));
  });
  fillBaseAvailArea([]);
  document.getElementById('teacherLoginEmail').value = '';
  document.getElementById('teacherLoginPassword').value = '';
  document.getElementById('teacherLoginMsg').textContent = '';
  document.getElementById('teacherLoginStatus').textContent = '講師情報を先に登録してから発行できます。';
  document.getElementById('teacherLoginStatus').className = 'login-status-box';
  document.getElementById('createTeacherLoginBtn').disabled = true;
  document.getElementById('resyncTeacherLoginBtn').style.display = 'none';
  document.getElementById('formModeTitle').textContent = '講師を登録';
  document.getElementById('saveBtn').textContent = '登録する';
  document.getElementById('cancelBtn').style.display = 'none';
  document.getElementById('formMsg').textContent = '';
}

function fillFormForEdit(t){
  S.editingId = t.id;
  document.getElementById('nameInput').value = t.name;
  document.getElementById('perLessonRateInput').value = String(t.perLessonRate!=null ? t.perLessonRate : 1500);
  document.getElementById('dailyTransportInput').value = String(t.dailyTransport!=null ? t.dailyTransport : 500);
  document.getElementById('teacherNotesInput').value = t.notes || '';

  const hasEarly = !!(t.earlyLessonException && t.earlyLessonException.lessonCount>0);
  document.getElementById('earlyExceptionToggle').checked = hasEarly;
  document.getElementById('earlyExceptionArea').style.display = hasEarly ? 'flex' : 'none';
  document.getElementById('earlyExceptionCount').value = hasEarly ? String(t.earlyLessonException.lessonCount) : '';
  document.getElementById('earlyExceptionRate').value = hasEarly ? String(t.earlyLessonException.rate) : '';

  const hasRaise = !!(t.raiseSchedule && t.raiseSchedule.length>0);
  document.getElementById('raiseScheduleToggle').checked = hasRaise;
  document.getElementById('raiseScheduleArea').style.display = hasRaise ? 'block' : 'none';
  S.formRaiseSchedule = hasRaise ? JSON.parse(JSON.stringify(t.raiseSchedule)) : [];
  renderRaiseScheduleList();

  document.querySelectorAll('#subjectArea input[type=checkbox]').forEach(cb=>{
    const match = t.subjects.find(s=>s.level===cb.dataset.level && s.subject===cb.dataset.subject);
    cb.checked = !!match;
    cb.dispatchEvent(new Event('change'));
    if(match && match.preferred){
      const star = document.querySelector(`.star-btn[data-level="${cb.dataset.level}"][data-subject="${cb.dataset.subject}"]`);
      if(star){ star.dataset.preferred='1'; star.textContent='★'; star.classList.add('active'); }
    }
  });
  fillBaseAvailArea(t.baseAvailability);
  document.getElementById('teacherLoginEmail').value = t.loginEmail || '';
  document.getElementById('teacherLoginPassword').value = '';
  document.getElementById('teacherLoginMsg').textContent = '';
  document.getElementById('createTeacherLoginBtn').disabled = false;
  if(t.loginUid){
    document.getElementById('teacherLoginStatus').textContent = `発行済み（${t.loginEmail}）。パスワードを変更したい場合は、新しいパスワードを入力して再度発行してください。`;
    document.getElementById('teacherLoginStatus').className = 'login-status-box issued';
    document.getElementById('resyncTeacherLoginBtn').style.display = 'inline-block';
    document.getElementById('resyncTeacherLoginBtn').dataset.teacherId = t.id;
    document.getElementById('resyncTeacherLoginBtn').dataset.loginUid = t.loginUid;
  }else{
    document.getElementById('teacherLoginStatus').textContent = 'まだ発行されていません。';
    document.getElementById('teacherLoginStatus').className = 'login-status-box';
    document.getElementById('resyncTeacherLoginBtn').style.display = 'none';
  }
  document.getElementById('formModeTitle').textContent = `${t.name} さんを編集`;
  document.getElementById('saveBtn').textContent = '更新する';
  document.getElementById('cancelBtn').style.display = 'inline-block';
  document.getElementById('formMsg').textContent = '';
  switchView('manage');
  window.scrollTo({top:0, behavior:'smooth'});
}

async function handleSave(){
  const msg = document.getElementById('formMsg');
  const name = document.getElementById('nameInput').value.trim();
  if(!name){ msg.textContent = '講師名を入力してください。'; return; }

  const subjects = [];
  document.querySelectorAll('#subjectArea input[type=checkbox]:checked').forEach(cb=>{
    const star = document.querySelector(`.star-btn[data-level="${cb.dataset.level}"][data-subject="${cb.dataset.subject}"]`);
    subjects.push({level:cb.dataset.level, subject:cb.dataset.subject, preferred: !!(star && star.dataset.preferred==='1')});
  });
  if(subjects.length===0){ msg.textContent = '対応可能教科を1つ以上選択してください。'; return; }

  let perLessonRate = parseInt(document.getElementById('perLessonRateInput').value, 10);
  if(!Number.isFinite(perLessonRate) || perLessonRate<0) perLessonRate = 0;
  let dailyTransport = parseInt(document.getElementById('dailyTransportInput').value, 10);
  if(!Number.isFinite(dailyTransport) || dailyTransport<0) dailyTransport = 0;
  const notes = document.getElementById('teacherNotesInput').value.trim();
  const baseAvailability = readBaseAvailArea();

  let earlyLessonException = null;
  if(document.getElementById('earlyExceptionToggle').checked){
    let cnt = parseInt(document.getElementById('earlyExceptionCount').value, 10);
    let rate = parseInt(document.getElementById('earlyExceptionRate').value, 10);
    if(!Number.isFinite(cnt) || cnt<=0){ msg.textContent = '特別単価の対象コマ数を入力してください。'; return; }
    if(!Number.isFinite(rate) || rate<0) rate = 0;
    earlyLessonException = {lessonCount: cnt, rate: rate};
  }

  let raiseSchedule = null;
  if(document.getElementById('raiseScheduleToggle').checked){
    if(S.formRaiseSchedule.length===0){ msg.textContent = '昇給の予定を1件以上追加するか、チェックを外してください。'; return; }
    for(const r of S.formRaiseSchedule){
      if(!r.yearMonth){ msg.textContent = '昇給の適用開始年月を入力してください。'; return; }
    }
    raiseSchedule = JSON.parse(JSON.stringify(S.formRaiseSchedule)).sort((a,b)=> a.yearMonth < b.yearMonth ? -1 : 1);
  }

  msg.textContent = '保存中…';
  if(S.editingId){
    const idx = S.teachers.findIndex(t=>t.id===S.editingId);
    if(idx>-1) S.teachers[idx] = {id:S.editingId, name, subjects, perLessonRate, dailyTransport, notes, baseAvailability, earlyLessonException, raiseSchedule};
  }else{
    S.teachers.push({id:'t-'+Date.now()+'-'+Math.random().toString(36).slice(2,7), name, subjects, perLessonRate, dailyTransport, notes, baseAvailability, earlyLessonException, raiseSchedule});
  }
  const ok = await saveTeachers();
  if(ok){
    resetForm();
    renderTeacherList();
    renderMatrix();
    renderMatching();
  }
}

// ---------- teacher list ----------
// 教科タグを学年（小学・中学・高校）ごとに3段で表示する
function subjectTagsByLevel(t){
  const rows = ['小学','中学','高校'].map(level=>{
    const list = t.subjects.filter(s=>s.level===level);
    if(list.length===0) return '';
    const tags = list.map(s=>{
      const c = subjectColor(s.level, s.subject);
      const star = s.preferred ? '★' : '';
      return `<span class="mini-tag" style="background:${c.bg};color:${c.text};border:1px solid ${c.border};">${star}${s.subject}</span>`;
    }).join('');
    return `<div class="subject-level-row"><span class="subject-level-label">${level}</span>${tags}</div>`;
  }).filter(Boolean);
  return rows.join('') || '<div class="empty-note" style="padding:4px 0;">対応可能教科が未登録です</div>';
}

// 講師一覧に表示する「基本の対応可能曜日・コマ」のミニ表（縦軸=コマ、横軸=曜日）
function buildBaseAvailMiniGrid(t){
  const list = t.baseAvailability || [];
  if(list.length===0) return '<div class="empty-note" style="padding:4px 0;">基本の対応可能曜日・コマが未登録です</div>';
  let html = '<table class="ba-mini-grid"><thead><tr><th></th>' + DAYS.map(d=>`<th>${d}</th>`).join('') + '</tr></thead><tbody>';
  SLOTS.forEach(slot=>{
    html += `<tr><th>${slot.label}</th>`;
    DAYS.forEach(day=>{
      const match = list.find(e=>e.day===day && e.slot===slot.id);
      const mark = !match ? '×' : (match.priority==='preferred' ? '○' : '△');
      const cls = !match ? 'ba-none' : (match.priority==='preferred' ? 'ba-preferred' : 'ba-normal');
      html += `<td class="${cls}">${mark}</td>`;
    });
    html += '</tr>';
  });
  html += '</tbody></table>';
  return html;
}

// 講師一覧に表示する給与条件の要約テキストを組み立てる
function paySummaryText(t){
  const parts = [];
  parts.push(`コマ単価 ${(t.perLessonRate||0).toLocaleString()}円`);
  parts.push(`交通費 ${(t.dailyTransport||0).toLocaleString()}円/日`);
  if(t.earlyLessonException && t.earlyLessonException.lessonCount>0){
    parts.push(`最初の${t.earlyLessonException.lessonCount}コマは${t.earlyLessonException.rate.toLocaleString()}円`);
  }
  if(t.raiseSchedule && t.raiseSchedule.length>0){
    const sorted = [...t.raiseSchedule].sort((a,b)=> a.yearMonth < b.yearMonth ? -1 : 1);
    const raiseTexts = sorted.map(r=>`${r.yearMonth}〜${r.rate.toLocaleString()}円`);
    parts.push(`昇給：${raiseTexts.join('／')}`);
  }
  return parts.join('　｜　');
}

function renderTeacherList(){
  scheduleSave();
  const wrap = document.getElementById('teacherList');
  if(S.teachers.length===0){
    wrap.innerHTML = '<div class="empty-note">まだ講師が登録されていません。上のフォームから登録してください。</div>';
    return;
  }
  wrap.innerHTML = '';
  S.teachers.forEach(t=>{
    const row = document.createElement('div');
    row.className = 'teacher-row';
    row.innerHTML = `
      <div class="trow-top">
        <div class="name">${t.name}</div>
        <div class="row-actions">
          <button class="edit-btn" data-id="${t.id}">編集</button>
          <button class="del-btn" data-id="${t.id}">削除</button>
        </div>
      </div>
      <div class="subject-level-block">${subjectTagsByLevel(t)}</div>
      <div class="trow-pay">${paySummaryText(t)}</div>
      <div class="trow-split">
        <div class="trow-notes-col">
          ${t.notes ? `<div class="trow-notes">${t.notes.replace(/</g,'&lt;').replace(/\n/g,'<br>')}</div>` : '<div class="empty-note" style="padding:4px 0;">備考なし</div>'}
        </div>
        <div class="trow-grid-col">
          <div class="ba-mini-title">基本の対応可能曜日・コマ</div>
          ${buildBaseAvailMiniGrid(t)}
        </div>
      </div>`;
    wrap.appendChild(row);
  });
  wrap.querySelectorAll('.edit-btn').forEach(b=>{
    b.addEventListener('click', ()=>{
      const t = S.teachers.find(x=>x.id===b.dataset.id);
      if(t) fillFormForEdit(t);
    });
  });
  wrap.querySelectorAll('.del-btn').forEach(b=>{
    b.addEventListener('click', ()=>{
      if(b.dataset.confirming){
        deleteTeacher(b.dataset.id);
      }else{
        b.dataset.confirming = '1';
        b.textContent = '本当に削除しますか？';
        setTimeout(()=>{ b.dataset.confirming=''; b.textContent='削除'; }, 3000);
      }
    });
  });
}

async function deleteTeacher(id){
  S.teachers = S.teachers.filter(t=>t.id!==id);
  S.assignments = S.assignments.filter(a=>a.teacherId!==id);
  await saveTeachers();
  if(S.editingId===id) resetForm();
  renderTeacherList();
  renderMatrix();
  renderMatching();
}

// =====================================================================

export { loadTeachers, saveTeachers, buildSubjectArea, buildSubjectFilterOptions, resetForm, fillFormForEdit, handleSave, subjectTagsByLevel, buildBaseAvailMiniGrid, paySummaryText, renderTeacherList, deleteTeacher };
