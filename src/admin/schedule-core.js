import { SUBJECT_MAP, DAYS, SLOTS, WEEKDAY_JP, WEEK_FULL } from '../shared/constants.js';
import { HOLIDAYS_JP } from '../shared/holidays.js';
import { pad2, daysInYearMonth, toDateStr, getTodayStr } from '../shared/date-utils.js';
import { firebaseConfig, fbAuth, fbDb, STORAGE_KEY, getSecondaryAuth, S } from './state.js';
import { shortName } from './calendar.js';

// ---- 講師スケジュール（月次提出・実日付ベース） ----
// teacher.availability（曜日パターン）は廃止し、月ごとに実際の日付で提出する方式に変更。
// S.teacherSchedules: [{id, teacherId, yearMonth:'YYYY-MM', status:'submitted'|'draft', days:{ 'YYYY-MM-DD':[{slot,priority}] }}]

function findTeacherSchedule(teacherId, yearMonth){
  return S.teacherSchedules.find(s=>s.teacherId===teacherId && s.yearMonth===yearMonth) || null;
}
function getOrCreateDraftSchedule(teacherId, yearMonth){
  let sch = findTeacherSchedule(teacherId, yearMonth);
  if(!sch){
    sch = {id:'tsch-'+Date.now()+'-'+Math.random().toString(36).slice(2,6), teacherId, yearMonth, status:'draft', days:{}};
    S.teacherSchedules.push(sch);
  }else if(!sch.id){
    // 過去のデータでidが欠けている場合はここで補完する（Firestore保存時のエラーを防ぐため）
    sch.id = 'tsch-'+Date.now()+'-'+Math.random().toString(36).slice(2,6);
  }
  return sch;
}
function getDateSlotState(teacherId, dateStr, slot){
  const sch = findTeacherSchedule(teacherId, dateStr.slice(0,7));
  if(!sch) return 'none';
  const entries = sch.days[dateStr] || [];
  const e = entries.find(x=>x.slot===slot);
  return e ? e.priority : 'none'; // 'normal' | 'preferred' | 'none'(×)
}
function setDateSlotState(schedule, dateStr, slot, state){
  if(!schedule.days[dateStr]) schedule.days[dateStr] = [];
  schedule.days[dateStr] = schedule.days[dateStr].filter(x=>x.slot!==slot);
  if(state!=='none') schedule.days[dateStr].push({slot, priority:state});
}
// ×→○→△→× の順で循環
function cycleTeacherState(state){
  if(state==='none') return 'preferred';
  if(state==='preferred') return 'normal';
  return 'none';
}

// ---- 講師登録時の「基本の対応可能曜日・コマ」（面接時ヒアリング用のプロフィール。実際のマッチングには使わない） ----
function buildBaseAvailArea(){
  const area = document.getElementById('baseAvailArea');
  if(!area) return;
  let thead = '<thead><tr><th></th>' + DAYS.map(d=>`<th>${d}</th>`).join('') + '</tr></thead>';
  let tbody = '<tbody>';
  SLOTS.forEach(slot=>{
    tbody += `<tr><th>${slot.label}</th>`;
    DAYS.forEach(day=>{
      tbody += `<td><button type="button" class="ts-cell-btn st-none" data-day="${day}" data-slot="${slot.id}">×</button></td>`;
    });
    tbody += '</tr>';
  });
  tbody += '</tbody>';
  area.innerHTML = `<div class="ts-grid-scroll"><table class="ts-grid">${thead}${tbody}</table></div>`;
  area.querySelectorAll('.ts-cell-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const cur = btn.classList.contains('st-preferred') ? 'preferred' : (btn.classList.contains('st-normal') ? 'normal' : 'none');
      const next = cycleTeacherState(cur);
      btn.className = `ts-cell-btn st-${next}`;
      btn.textContent = next==='none' ? '×' : (next==='preferred' ? '○' : '△');
    });
  });
}
// フォーム上のグリッドの現在の状態を読み取り、{day,slot,priority}の配列にする（×は除外）
function readBaseAvailArea(){
  const result = [];
  document.querySelectorAll('#baseAvailArea .ts-cell-btn').forEach(btn=>{
    const state = btn.classList.contains('st-preferred') ? 'preferred' : (btn.classList.contains('st-normal') ? 'normal' : 'none');
    if(state==='none') return;
    result.push({day:btn.dataset.day, slot:Number(btn.dataset.slot), priority:state});
  });
  return result;
}
// 登録済みデータをもとに、フォーム上のグリッドへ状態を反映する
function fillBaseAvailArea(baseAvailability){
  const list = baseAvailability || [];
  document.querySelectorAll('#baseAvailArea .ts-cell-btn').forEach(btn=>{
    const match = list.find(e=>e.day===btn.dataset.day && e.slot===Number(btn.dataset.slot));
    const state = match ? match.priority : 'none';
    btn.className = `ts-cell-btn st-${state}`;
    btn.textContent = state==='none' ? '×' : (state==='preferred' ? '○' : '△');
  });
}

// ---- 昇給スケジュール（講師登録フォーム上での一時管理） ----
function renderRaiseScheduleList(){
  const wrap = document.getElementById('raiseScheduleList');
  if(!wrap) return;
  if(S.formRaiseSchedule.length===0){
    wrap.innerHTML = '<div class="empty-note" style="padding:8px 0;">まだ昇給の予定が追加されていません。</div>';
    return;
  }
  wrap.innerHTML = S.formRaiseSchedule.map((r, idx)=>`
    <div class="raise-row" data-idx="${idx}">
      <span class="raise-label">適用開始</span>
      <input type="month" class="raise-month-input" data-idx="${idx}" value="${r.yearMonth}">
      <span class="raise-label">〜 単価</span>
      <input type="text" inputmode="numeric" class="raise-rate-input" data-idx="${idx}" value="${r.rate}" placeholder="円/コマ">
      <span class="raise-label">円</span>
      <button type="button" class="remove-raise-btn" data-idx="${idx}">削除</button>
    </div>
  `).join('');
  wrap.querySelectorAll('.raise-month-input').forEach(inp=>{
    inp.addEventListener('change', ()=>{ S.formRaiseSchedule[Number(inp.dataset.idx)].yearMonth = inp.value; });
  });
  wrap.querySelectorAll('.raise-rate-input').forEach(inp=>{
    inp.addEventListener('change', ()=>{
      let v = parseInt(inp.value, 10);
      if(!Number.isFinite(v) || v<0) v = 0;
      inp.value = String(v);
      S.formRaiseSchedule[Number(inp.dataset.idx)].rate = v;
    });
  });
  wrap.querySelectorAll('.remove-raise-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      S.formRaiseSchedule.splice(Number(btn.dataset.idx), 1);
      renderRaiseScheduleList();
    });
  });
}
function addRaiseRow(yearMonth, rate){
  const t = new Date();
  S.formRaiseSchedule.push({
    yearMonth: yearMonth || `${t.getFullYear()}-${pad2(t.getMonth()+1)}`,
    rate: rate!=null ? rate : 0,
  });
  renderRaiseScheduleList();
}

// 対象月内で、その曜日に該当する実日付のいずれかで対応可能なら、その曜日は対応可能とみなす（優先度は最も高いものを採用）
// 月のスケジュールが未提出（レコードなし）の場合は全日×（対応不可）扱い
function getWeekdayAvailabilityInMonth(teacherId, weekday, slot, yearMonth){
  if(!yearMonth) return null;
  const sch = findTeacherSchedule(teacherId, yearMonth);
  if(!sch || sch.status !== 'submitted') return null; // 未提出（下書きのみも不可）
  const total = daysInYearMonth(yearMonth);
  let best = null;
  for(let d=1; d<=total; d++){
    const dateStr = `${yearMonth}-${pad2(d)}`;
    const wd = WEEKDAY_JP[new Date(dateStr+'T00:00:00').getDay()];
    if(wd!==weekday) continue;
    const state = getDateSlotState(teacherId, dateStr, slot);
    if(state==='preferred') best = 'preferred';
    else if(state==='normal' && best!=='preferred') best = 'normal';
  }
  return best; // null(不可) | 'normal' | 'preferred'
}

// ---- 既存コード互換のためのブリッジ（曜日パターンとして扱う関数群） ----
// S.referenceYearMonth（対象月）の提出内容をもとに、曜日単位の対応可否を判定する
function isAvailable(teacher, day, slot){
  return getWeekdayAvailabilityInMonth(teacher.id, day, slot, S.referenceYearMonth) !== null;
}
function isPreferredDay(teacher, day, slot){
  return getWeekdayAvailabilityInMonth(teacher.id, day, slot, S.referenceYearMonth) === 'preferred';
}
function countAvailSlots(teacher){
  let count = 0;
  DAYS.forEach(d=> SLOTS.forEach(s=>{
    if(getWeekdayAvailabilityInMonth(teacher.id, d, s.id, S.referenceYearMonth)!==null) count++;
  }));
  return count;
}

const LEVEL_ABBR = {'小学':'小', '中学':'中', '高校':'高'};
const SUBJECT_ABBR = {'国語':'国', '算数':'算', '数学':'数', '英語':'英', '理科':'理', '社会':'社'};
function abbr(level, subject){ return (LEVEL_ABBR[level]||'') + (SUBJECT_ABBR[subject]||''); }

// 生徒の学年表示（例：小5、中3、高2）。gradeが未設定の場合は学年区分のみ表示
function gradeLabel(student){
  if(!student) return '';
  if(student.grade){ return `${LEVEL_ABBR[student.level]||''}${student.grade}`; }
  return student.level || '';
}
// 講師名を「姓＋先生」の形式にする（例：鈴木 先生）。フルネームは出さない
function teacherHonorific(teacher){
  if(!teacher) return '(削除された講師)';
  return `${shortName(teacher.name)} 先生`;
}

// 教科ごとに色相（hue）を固定し、小/中/高で濃淡（明度）を変える
const SUBJECT_HUE = {
  '国語': 352,   // 赤系
  '算数': 208,   // 青系
  '数学': 208,   // 青系（算数と同系統）
  '英語': 265,   // 紫系
  '理科': 138,   // 緑系
  '社会': 32,    // 橙系
};
const LEVEL_SHADE = {
  '小学': {s:62, l:90},  // 薄い
  '中学': {s:62, l:74},  // 中間
  '高校': {s:58, l:50},  // 濃い
};
function subjectColor(level, subject){
  const h = SUBJECT_HUE[subject] ?? 0;
  const shade = LEVEL_SHADE[level] || {s:55, l:70};
  const bg = `hsl(${h} ${shade.s}% ${shade.l}%)`;
  const text = shade.l < 58 ? '#ffffff' : '#2c2416';
  const border = `hsl(${h} ${shade.s}% ${Math.max(shade.l-18,15)}%)`;
  return {bg, text, border};
}
// 集計タグの表示順（小→中→高 × 国算数英理社）
const ABBR_ORDER = [];
Object.entries(SUBJECT_MAP).forEach(([level, subs])=>{
  subs.forEach(sub=>{ const a = abbr(level, sub); if(!ABBR_ORDER.includes(a)) ABBR_ORDER.push(a); });
});

// ---- 教科カテゴリ（算数/数学は「数」として統一）----
const SUBJECT_CATEGORY = {'国語':'国', '算数':'数', '数学':'数', '英語':'英', '理科':'理', '社会':'社'};
const CATEGORY_REP_SUBJECT = {'国':'国語', '数':'数学', '英':'英語', '理':'理科', '社':'社会'};
const CATS = ['国','数','英','理','社'];
const LEVELS_ORDER = ['小学','中学','高校'];

function categoryColor(cat){
  if(cat==='ALL'){
    return {bg:'#3a2f13', text:'#ffffff', border:'#241d0b'};
  }
  return subjectColor('中学', CATEGORY_REP_SUBJECT[cat]);
}

// 講師1人分の対応教科を「国（小中）」「全科目（小）」のようにまとめる
function summarizeTeacherSubjects(t){
  const grid = {};
  LEVELS_ORDER.forEach(lv=> grid[lv] = {});
  t.subjects.forEach(s=>{
    const cat = SUBJECT_CATEGORY[s.subject];
    if(cat) grid[s.level][cat] = true;
  });

  const labels = [];
  // 学年内で全教科そろっていれば「全科目（学年）」にまとめる
  LEVELS_ORDER.forEach(lv=>{
    if(CATS.every(c=>grid[lv][c])){
      labels.push({text:`全科目（${LEVEL_ABBR[lv]}）`, color: categoryColor('ALL')});
      CATS.forEach(c=> grid[lv][c] = false);
    }
  });
  // 残りは教科ごとに、対応する学年をまとめて表示
  CATS.forEach(cat=>{
    const lvs = LEVELS_ORDER.filter(lv=>grid[lv][cat]);
    if(lvs.length){
      const lvStr = lvs.map(lv=>LEVEL_ABBR[lv]).join('');
      labels.push({text:`${cat}（${lvStr}）`, color: categoryColor(cat)});
    }
  });
  return labels;
}





export { findTeacherSchedule, getOrCreateDraftSchedule, getDateSlotState, setDateSlotState, cycleTeacherState, buildBaseAvailArea, readBaseAvailArea, fillBaseAvailArea, renderRaiseScheduleList, addRaiseRow, getWeekdayAvailabilityInMonth, isAvailable, isPreferredDay, countAvailSlots, abbr, gradeLabel, teacherHonorific, subjectColor, categoryColor, summarizeTeacherSubjects };
