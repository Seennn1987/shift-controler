import { SUBJECT_MAP, DAYS, SLOTS, WEEKDAY_JP, WEEK_FULL, SUBJECT_ABBR } from '../shared/constants.js';
import { HOLIDAYS_JP } from '../shared/holidays.js';
import { pad2, daysInYearMonth, toDateStr, getTodayStr } from '../shared/date-utils.js';
import { firebaseConfig, fbAuth, fbDb, STORAGE_KEY, getSecondaryAuth, S } from './state.js';
import { cancelAbsenceRecord, cancelMakeup, confirmMakeup, findMakeupCandidates, getEffectiveDayAssignments, getStudentDateRows, markNoMakeup, recordAbsence } from './absences.js';
import { getWeekMonday, renderCalendarWeek, renderMatrix } from './finance-ui.js';
import { jumpToCalendarForDate, renderMatching } from './matching.js';
import { gradeLabel, isAvailable, subjectColor, teacherHonorific } from './schedule-core.js';
import { buildCandidateInfo, cancelAssignment, compareCandidateInfo, confirmAssignment, countRoomSlot, countTeacherSlot, findAlternativeSlots, renderTeacherScheduleTab, replaceDesiredSlot } from './teacher-schedule-tab.js';

// カレンダー（トップページ・TimeTree風シンプルUI）
// =====================================================================


// 指定日のステータスを判定する
// {type:'outside'|'custom-closed'|'closed-weekday'|'holiday'|'open', label, weekday, count, holidayName, closureLabel}
function findCustomClosure(dateStr){
  return S.customClosures.find(c=> dateStr>=c.startDate && dateStr<=c.endDate) || null;
}

function getDayStatus(dateStr){
  const d = new Date(dateStr+'T00:00:00');
  const weekday = WEEKDAY_JP[d.getDay()];

  // 通常授業は常に開校期間（アプリ利用開始時から継続）。休校となるのは以下の例外のみ
  const closure = findCustomClosure(dateStr);
  if(closure){
    return {type:'custom-closed', label:closure.label, weekday, closureLabel:closure.label};
  }
  if(S.regularClosedDays.includes(weekday)){
    return {type:'closed-weekday', label:'定休日', weekday};
  }
  if(S.holidayAutoDetect){
    const h = HOLIDAYS_JP.find(x=>x.date===dateStr);
    if(h){
      return {type:'holiday', label:h.name, weekday, holidayName:h.name};
    }
  }
  // 日曜日はそもそも曜日パターンの対象外（DAYSに含まれない）ため、定休日指定がなければ常に0件の営業日として扱う
  const count = weekday==='日' ? 0 : S.assignments.filter(a=>a.day===weekday).length;
  return {type:'open', label:'', weekday, count};
}

function shortName(fullName){ return (fullName||'').split(/\s+/)[0]; }

// その日（曜日）に表示するテキスト行を組み立てる（生徒フィルターあり／なし共通）
function buildDayCellLines(dateStr, filterStudent){
  const status = getDayStatus(dateStr);
  const weekday = status.weekday;
  const lines = [];
  if(filterStudent){
    const rows = getStudentDateRows(filterStudent, dateStr);
    rows.forEach(r=>{
      const subAbbr = SUBJECT_ABBR[r.course.subject] || r.course.subject.slice(0,1);
      const sc = subjectColor(filterStudent.level, r.course.subject);
      if(r.isMakeupTarget){
        const teacher = S.teachers.find(t=>t.id===r.absence.makeup.teacherId);
        lines.push({text:`${subAbbr}:${teacher?shortName(teacher.name):'?'}(振替)`, cls:'makeup', bg:sc.bg, color:sc.text});
      }else if(r.absence){
        lines.push({text:`${subAbbr}:欠席`, cls:'absent'});
      }else if(r.existing){
        const teacher = S.teachers.find(t=>t.id===r.existing.teacherId);
        lines.push({text:`${subAbbr}:${teacher?shortName(teacher.name):'?'}`, cls:'confirmed', bg:sc.bg, color:sc.text});
      }else{
        lines.push({text:`${subAbbr}:未確定`, cls:'pending'});
      }
    });
  }else{
    getEffectiveDayAssignments(dateStr).forEach(a=>{
      const student = S.students.find(s=>s.id===a.studentId);
      const subAbbr = SUBJECT_ABBR[a.subject] || a.subject.slice(0,1);
      const suffix = a.kind==='makeup' ? '(振替)' : '';
      const sc = student ? subjectColor(student.level, a.subject) : {bg:'#eee', text:'#333'};
      lines.push({text:`${subAbbr}:${student?shortName(student.name):'?'}${suffix}`, cls: a.kind==='makeup' ? 'makeup' : 'confirmed', bg:sc.bg, color:sc.text});
    });
  }
  return lines;
}

// 教室全体表示用：その実日付における4コマ(4講〜7講)それぞれの混雑度（欠席・振替を反映した実人数/S.roomCapacity）を計算する
function buildDayHeat(dateStr){
  const list = getEffectiveDayAssignments(dateStr);
  return SLOTS.map(slot=>{
    const count = list.filter(a=>a.slot===slot.id).length;
    const ratio = S.roomCapacity>0 ? Math.min(count/S.roomCapacity, 1) : 0;
    return {slotLabel:slot.label, count, ratio};
  });
}

function renderCalendar(){
  const grid = document.getElementById('calGrid');
  if(!grid) return;
  if(S.calYear===undefined){
    const t = new Date();
    S.calYear = t.getFullYear();
    S.calMonth = t.getMonth();
  }
  S.referenceYearMonth = `${S.calYear}-${pad2(S.calMonth+1)}`;
  document.getElementById('calTitle').textContent = `${S.calYear}年${S.calMonth+1}月`;

  if(!S.dataReady || !S.studentDataReady){
    grid.innerHTML = '<div class="loading">読み込み中…</div>';
    return;
  }

  const filterStudent = S.calFilterStudentId ? S.students.find(s=>s.id===S.calFilterStudentId) : null;
  const MAX_LINES = 3;

  const firstDay = new Date(S.calYear, S.calMonth, 1);
  const daysInMonth = new Date(S.calYear, S.calMonth+1, 0).getDate();
  const startWeekday = firstDay.getDay(); // 0=日
  const todayStr = getTodayStr();

  let html = WEEKDAY_JP.map((w,i)=>`<div class="cal-dow ${i===0?'sun':(i===6?'sat':'')}">${w}</div>`).join('');

  for(let i=0;i<startWeekday;i++){
    html += `<div class="cal-cell blank"></div>`;
  }

  for(let day=1; day<=daysInMonth; day++){
    const dateStr = toDateStr(S.calYear, S.calMonth, day);
    const status = getDayStatus(dateStr);
    const classes = ['cal-cell', status.type];
    if(dateStr===todayStr) classes.push('today');
    if(dateStr===S.calSelectedDate) classes.push('selected');

    let inner = `<div class="cal-daynum">${day}</div>`;
    if(status.type==='open'){
      if(filterStudent){
        // 生徒フィルター時：1人分は多くても週2-3コマなので、個別テキストのまま表示して問題ない
        const lines = buildDayCellLines(dateStr, filterStudent);
        const pendingCount = lines.filter(l=>l.cls==='pending').length;
        if(pendingCount>0) classes.push('has-pending');
        if(lines.length===0) classes.push('no-activity');

        let entriesHtml = '';
        lines.slice(0, MAX_LINES).forEach(l=>{
          const styleAttr = l.bg ? ` style="background:${l.bg};color:${l.color};"` : '';
          entriesHtml += `<div class="cal-entry ${l.cls}"${styleAttr}>${l.text}</div>`;
        });
        if(lines.length>MAX_LINES){
          entriesHtml += `<div class="cal-entry-more">他${lines.length-MAX_LINES}件</div>`;
        }
        inner += `<div class="cal-entries">${entriesHtml}</div>`;
      }else{
        // 教室全体表示時：個別列挙ではなく、コマ別の混雑度を「4講:3コマ」のように文字＋色で縦に並べて示す
        const heat = buildDayHeat(dateStr);
        const total = heat.reduce((sum,h)=>sum+h.count, 0);
        if(total===0){
          classes.push('no-activity');
          inner += `<div class="cal-heat-empty">−</div>`;
        }else{
          const heatBoxes = heat.map(h=>{
            const level = h.ratio===0 ? 0 : (h.ratio<0.4 ? 1 : (h.ratio<0.8 ? 2 : 3));
            return `<div class="cal-heat-box lv${level}" title="${h.slotLabel} ${h.count}/${S.roomCapacity}人">${h.slotLabel}:${h.count}コマ</div>`;
          }).join('');
          inner += `<div class="cal-heat-stack">${heatBoxes}</div>`;
        }
      }
    }else if(status.type==='holiday'){
      inner += `<div class="cal-sublabel">${status.holidayName}</div>`;
    }else if(status.type==='custom-closed'){
      inner += `<div class="cal-sublabel">${status.closureLabel}</div>`;
    }else if(status.type==='closed-weekday'){
      inner += `<div class="cal-sublabel">定休</div>`;
    }

    const clickable = (status.type==='open');
    html += `<div class="${classes.join(' ')}" ${clickable?`data-date="${dateStr}"`:''}>${inner}</div>`;
  }

  grid.innerHTML = html;
  grid.querySelectorAll('.cal-cell[data-date]').forEach(cell=>{
    cell.addEventListener('click', ()=>{
      S.calSelectedDate = cell.dataset.date;
      renderCalendar();
      renderCalendarDetail(cell.dataset.date);
    });
  });

  // 選択中の日が今表示中の月の外に出た場合は詳細パネルを隠す
  if(S.calSelectedDate){
    const stillVisible = document.querySelector(`.cal-cell[data-date="${S.calSelectedDate}"]`);
    if(!stillVisible){
      document.getElementById('calDetailCard').style.display = 'none';
    }
  }
}

function refreshCalStudentFilterOptions(){
  const sel = document.getElementById('calStudentFilter');
  if(!sel) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">すべて（教室全体）</option>' +
    S.students.map(s=>`<option value="${s.id}">${s.name}（${gradeLabel(s)}）</option>`).join('');
  if(S.students.some(s=>s.id===cur)) sel.value = cur;
  else S.calFilterStudentId = '';
}

function renderCalendarDetail(dateStr){
  const card = document.getElementById('calDetailCard');
  const wrap = document.getElementById('calDetailWrap');
  const status = getDayStatus(dateStr);
  const weekday = status.weekday;
  const d = new Date(dateStr+'T00:00:00');
  const label = `${d.getMonth()+1}月${d.getDate()}日（${weekday}）`;

  const filterStudent = S.calFilterStudentId ? S.students.find(s=>s.id===S.calFilterStudentId) : null;
  const detailYearMonth = dateStr.slice(0,7);

  if(filterStudent){
    document.getElementById('calDetailTitle').textContent = `${label}の${filterStudent.name}さん（${gradeLabel(filterStudent)}）の授業`;
    card.style.display = 'block';

    const rows = getStudentDateRows(filterStudent, dateStr);
    if(rows.length===0){
      wrap.innerHTML = `<div class="cal-empty-day">${filterStudent.name}さんは、この曜日（${weekday}曜日）に希望しているコマがありません。</div>`;
      return;
    }
    let html = `<div class="cal-day-note">${filterStudent.name}さんの希望曜日パターン（＋振替）から、この日の状況を表示しています。ここから直接、確定・欠席登録・振替確定ができます。</div>`;
    rows.forEach(r=>{
      const c = subjectColor(filterStudent.level, r.course.subject);

      if(r.isMakeupTarget){
        // この日は振替授業として追加された特別な1回
        const teacher = S.teachers.find(t=>t.id===r.absence.makeup.teacherId);
        html += `<div class="match-slot">
          <div class="ms-slot-label">${r.slot.label}（${r.slot.time}）</div>
          <div class="confirmed-box makeup-box">
            <span class="cb-label makeup-label">振替授業</span>
            <span class="sched-student-tag" style="background:${c.bg};color:${c.text};">${r.course.subject}</span>
            <span class="cb-teacher">講師：${teacherHonorific(teacher)}</span>
            <button class="cancel-makeup-btn" data-absence="${r.absence.id}">振替を取り消す</button>
          </div>
        </div>`;
        return;
      }

      if(r.absence){
        // この日は欠席登録済み
        if(r.absence.status==='resolved' && r.absence.makeup){
          const mDate = new Date(r.absence.makeup.date+'T00:00:00');
          const mSlot = SLOTS.find(sl=>sl.id===r.absence.makeup.slot);
          const teacher = S.teachers.find(t=>t.id===r.absence.makeup.teacherId);
          html += `<div class="match-slot">
            <div class="ms-slot-label">${r.slot.label}（${r.slot.time}）</div>
            <div class="absence-box">
              <span class="cb-label absence-label">欠席</span>
              <span class="sched-student-tag" style="background:${c.bg};color:${c.text};">${r.course.subject}</span>
              <span class="cb-teacher">振替先：${mDate.getMonth()+1}/${mDate.getDate()}（${teacher?teacher.name:'?'}）</span>
              <button class="cancel-absence-btn" data-absence="${r.absence.id}">欠席を取り消す</button>
            </div>
          </div>`;
        }else if(r.absence.status==='no-makeup'){
          const panelId2 = `makeup-cand-${r.absence.id}`;
          html += `<div class="match-slot">
            <div class="ms-slot-label">${r.slot.label}（${r.slot.time}）</div>
            <div class="absence-box">
              <span class="cb-label absence-label">欠席（振替なし）</span>
              <span class="sched-student-tag" style="background:${c.bg};color:${c.text};">${r.course.subject}</span>
              <button class="find-makeup-btn" data-absence="${r.absence.id}" data-student="${filterStudent.id}" data-level="${filterStudent.level}" data-subject="${r.course.subject}" data-date="${dateStr}" data-target="${panelId2}">振替を探す</button>
              <button class="cancel-absence-btn" data-absence="${r.absence.id}">欠席を取り消す</button>
            </div>
            <div class="makeup-cand-list" id="${panelId2}" style="display:none;"></div>
          </div>`;
        }else{
          // pending：振替を探すか、振替なしで確定するかを選ぶ（初期状態では候補は出さない）
          const panelId = `makeup-cand-${r.absence.id}`;
          html += `<div class="match-slot">
            <div class="ms-slot-label">${r.slot.label}（${r.slot.time}）</div>
            <div class="absence-box">
              <span class="cb-label absence-label">欠席（未対応）</span>
              <span class="sched-student-tag" style="background:${c.bg};color:${c.text};">${r.course.subject}</span>
              <button class="find-makeup-btn" data-absence="${r.absence.id}" data-student="${filterStudent.id}" data-level="${filterStudent.level}" data-subject="${r.course.subject}" data-date="${dateStr}" data-target="${panelId}">振替を探す</button>
              <button class="no-makeup-btn" data-absence="${r.absence.id}">振替なしで確定</button>
              <button class="cancel-absence-btn" data-absence="${r.absence.id}">欠席を取り消す</button>
            </div>
            <div class="makeup-cand-list" id="${panelId}" style="display:none;"></div>
          </div>`;
        }
        return;
      }

      if(r.existing){
        const teacher = S.teachers.find(t=>t.id===r.existing.teacherId);
        const used = teacher ? countTeacherSlot(teacher.id, weekday, r.slot.id, null, detailYearMonth) : 0;
        const autoBadge = r.existing.source==='auto' ? '<span class="auto-badge">自動</span>' : '';
        if(r.isPending){
          html += `<div class="match-slot">
            <div class="ms-slot-label">${r.slot.label}（${r.slot.time}）</div>
            <div class="confirmed-box pending-box">
              <span class="cb-label pending-label">承認待ち${autoBadge}</span>
              <span class="sched-student-tag" style="background:${c.bg};color:${c.text};">${r.course.subject}</span>
              <span class="cb-teacher">講師：${teacherHonorific(teacher)}</span>
              <span class="cb-cap">（講師の承認待ち。承認されると確定します）</span>
              <button class="unconfirm-btn" data-student="${filterStudent.id}" data-course="${r.course.id}" data-day="${weekday}" data-slot="${r.slot.id}">取り消す</button>
            </div>
          </div>`;
        }else{
          html += `<div class="match-slot">
            <div class="ms-slot-label">${r.slot.label}（${r.slot.time}）</div>
            <div class="confirmed-box">
              <span class="cb-label">確定済み${autoBadge}</span>
              <span class="sched-student-tag" style="background:${c.bg};color:${c.text};">${r.course.subject}</span>
              <span class="cb-teacher">講師：${teacherHonorific(teacher)}</span>
              <span class="cb-cap">（定員 ${used}/${S.teacherCapacity}）</span>
              <button class="absent-btn" data-student="${filterStudent.id}" data-course="${r.course.id}" data-subject="${r.course.subject}" data-day="${weekday}" data-slot="${r.slot.id}" data-date="${dateStr}">欠席にする</button>
              <button class="unconfirm-btn" data-student="${filterStudent.id}" data-course="${r.course.id}" data-day="${weekday}" data-slot="${r.slot.id}">確定を解除</button>
            </div>
          </div>`;
        }
      }else{
        // 定休日等はそもそも希望登録できないはずだが念のためチェック
        if(S.regularClosedDays.includes(weekday)){
          html += `<div class="match-slot">
            <div class="ms-slot-label">${r.slot.label}（${r.slot.time}）</div>
            <div class="match-none">この曜日は定休日のため授業を組めません（基本設定で変更できます）</div>
          </div>`;
          return;
        }

        const candidates = S.teachers
          .filter(t => isAvailable(t, weekday, r.slot.id))
          .filter(t => t.subjects.some(ts=>ts.level===filterStudent.level && ts.subject===r.course.subject))
          .map(t => buildCandidateInfo(filterStudent.id, r.course.id, filterStudent.level, r.course.subject, weekday, r.slot.id, t))
          .sort(compareCandidateInfo);

        const roomUsed = countRoomSlot(weekday, r.slot.id, null, detailYearMonth);
        const roomFull = roomUsed >= S.roomCapacity;

        let candHtml = '';
        if(candidates.length===0){
          const alternatives = findAlternativeSlots(filterStudent.level, r.course.subject, r.course.desiredSlots);
          candHtml = `<div class="match-none">対応できる講師がいません（${weekday}曜${r.slot.label}は希望通りには組めません）</div>`;
          if(alternatives.length===0){
            candHtml += `<div class="match-none">他に空いている代替日程もありません。講師の追加登録をご検討ください。</div>`;
          }else{
            const panelId = `caldet-alt-${r.course.id}-${weekday}-${r.slot.id}`;
            candHtml += `<button type="button" class="alt-toggle-btn" data-target="${panelId}">代替日程を提案（${alternatives.length}件）</button>
            <div class="alt-panel" id="${panelId}">
              ${alternatives.map(alt=>{
                const altSlot = SLOTS.find(sl=>sl.id===alt.slot);
                return `<button type="button" class="alt-option-btn"
                  data-student="${filterStudent.id}" data-course="${r.course.id}"
                  data-old-day="${weekday}" data-old-slot="${r.slot.id}"
                  data-new-day="${alt.day}" data-new-slot="${alt.slot}">
                  ${alt.day}曜 ${altSlot.label}（${altSlot.time}）に変更
                </button>`;
              }).join('')}
            </div>`;
          }
        }else{
          candidates.forEach(cand=>{
            const blocked = cand.full || roomFull;
            const prefBadges = [
              cand.prefPair ? '<span class="pref-badge pref-pair">★教室長おすすめ</span>' : '',
              cand.prefSubject ? '<span class="pref-badge pref-subject">得意科目</span>' : '',
              cand.prefDay ? '<span class="pref-badge pref-day">◎優先希望日</span>' : '',
              cand.fillBonus ? '<span class="pref-badge pref-fill">穴埋め</span>' : '',
              cand.dayConsolidation ? '<span class="pref-badge pref-consolidate">稼働集約</span>' : '',
            ].join('');
            candHtml += `<div class="match-cand">
              <span class="match-badge full">対応可</span>
              <span>${cand.teacher.name}</span>
              ${prefBadges}
              <span class="cap-note ${cand.full?'full':''}">${cand.used}/${S.teacherCapacity}人</span>
              <button class="confirm-btn" data-student="${filterStudent.id}" data-course="${r.course.id}" data-subject="${r.course.subject}" data-day="${weekday}" data-slot="${r.slot.id}" data-teacher="${cand.teacher.id}" ${blocked?'disabled':''}>
                ${cand.full ? '満席' : (roomFull ? '教室満席' : '確定')}
              </button>
            </div>`;
          });
        }
        if(roomFull){
          candHtml += `<div class="match-none">教室全体の定員（${S.roomCapacity}人）に達しています</div>`;
        }

        html += `<div class="match-slot">
          <div class="ms-slot-label">${r.slot.label}（${r.slot.time}）<span style="font-weight:400;color:var(--ink-soft);"> ／ 教室 ${roomUsed}/${S.roomCapacity}</span></div>
          <div style="margin-bottom:6px;"><span class="sched-student-tag" style="background:${c.bg};color:${c.text};">${r.course.subject}</span></div>
          ${candHtml}
        </div>`;
      }
    });
    wrap.innerHTML = html;

    // 確定ボタン
    wrap.querySelectorAll('.confirm-btn').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const {student, course, subject, day, teacher} = btn.dataset;
        const slot = Number(btn.dataset.slot);
        const result = confirmAssignment(student, course, subject, day, slot, teacher);
        if(!result.ok){ alert(result.msg); return; }
        renderMatching(); renderCalendar(); renderCalendarDetail(dateStr);
      });
    });
    // 確定解除ボタン
    wrap.querySelectorAll('.unconfirm-btn').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        cancelAssignment(btn.dataset.student, btn.dataset.course, btn.dataset.day, Number(btn.dataset.slot));
        renderMatching(); renderCalendar(); renderCalendarDetail(dateStr);
      });
    });
    // 欠席にするボタン
    wrap.querySelectorAll('.absent-btn').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const {student, course, subject, day, date} = btn.dataset;
        const slot = Number(btn.dataset.slot);
        recordAbsence(student, course, subject, day, slot, date);
        renderMatching(); renderCalendar(); renderCalendarDetail(dateStr);
      });
    });
    // 欠席取り消しボタン
    wrap.querySelectorAll('.cancel-absence-btn').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        cancelAbsenceRecord(btn.dataset.absence);
        renderMatching(); renderCalendar(); renderCalendarDetail(dateStr);
      });
    });
    // 振替なしで確定するボタン
    wrap.querySelectorAll('.no-makeup-btn').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        markNoMakeup(btn.dataset.absence);
        renderMatching(); renderCalendar(); renderCalendarDetail(dateStr);
      });
    });
    // 振替を探すボタン（候補パネルをその場で開く）
    wrap.querySelectorAll('.find-makeup-btn').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const {student, level, subject, date, target} = btn.dataset;
        const panel = document.getElementById(target);
        if(!panel) return;
        const isOpen = panel.style.display !== 'none';
        if(isOpen){ panel.style.display = 'none'; return; }
        const absenceId = btn.dataset.absence;
        const makeupCands = findMakeupCandidates(student, level, subject, date);
        let makeupHtml = '';
        if(makeupCands.length===0){
          makeupHtml = `<div class="match-none">対応できる振替候補が見つかりませんでした。</div>`;
        }else{
          makeupCands.forEach(mc=>{
            const md = new Date(mc.date+'T00:00:00');
            const mLabel = `${md.getMonth()+1}/${md.getDate()}（${WEEKDAY_JP[md.getDay()]}）${mc.slot.label}`;
            mc.candidates.forEach(cand=>{
              makeupHtml += `<div class="match-cand">
                <span class="match-badge full">${mLabel}</span>
                <span>${cand.teacher.name}</span>
                <span class="cap-note">${cand.used}/${S.teacherCapacity}人</span>
                <button class="confirm-makeup-btn" data-absence="${absenceId}" data-date="${mc.date}" data-slot="${mc.slot.id}" data-teacher="${cand.teacher.id}">振替を確定</button>
              </div>`;
            });
          });
        }
        panel.innerHTML = makeupHtml;
        panel.style.display = 'block';
        panel.querySelectorAll('.confirm-makeup-btn').forEach(cbtn=>{
          cbtn.addEventListener('click', ()=>{
            const {absence, date:mDate, teacher} = cbtn.dataset;
            const slot = Number(cbtn.dataset.slot);
            const result = confirmMakeup(absence, mDate, slot, teacher);
            if(!result.ok){ alert(result.msg); return; }
            renderMatching(); renderCalendar(); renderCalendarDetail(dateStr);
          });
        });
      });
    });
    // 振替確定ボタン
    wrap.querySelectorAll('.confirm-makeup-btn').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const {absence, date, teacher} = btn.dataset;
        const slot = Number(btn.dataset.slot);
        const result = confirmMakeup(absence, date, slot, teacher);
        if(!result.ok){ alert(result.msg); return; }
        renderMatching(); renderCalendar(); renderCalendarDetail(dateStr);
      });
    });
    // 振替取り消しボタン
    wrap.querySelectorAll('.cancel-makeup-btn').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        cancelMakeup(btn.dataset.absence);
        renderMatching(); renderCalendar(); renderCalendarDetail(dateStr);
      });
    });
    // 代替日程パネルの開閉
    wrap.querySelectorAll('.alt-toggle-btn').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const panel = document.getElementById(btn.dataset.target);
        if(panel) panel.classList.toggle('open');
      });
    });
    // 代替日程を選択
    wrap.querySelectorAll('.alt-option-btn').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const {student, course} = btn.dataset;
        const oldDay = btn.dataset.oldDay, newDay = btn.dataset.newDay;
        const oldSlot = Number(btn.dataset.oldSlot), newSlot = Number(btn.dataset.newSlot);
        replaceDesiredSlot(student, course, oldDay, oldSlot, newDay, newSlot);
      });
    });
    return;
  }

  document.getElementById('calDetailTitle').textContent = `${label}の授業`;
  card.style.display = 'block';

  const list = getEffectiveDayAssignments(dateStr);
  if(list.length===0){
    wrap.innerHTML = '<div class="cal-empty-day">この日に確定している授業はありません。</div>';
    return;
  }

  let html = `<div class="cal-day-note">この日（${weekday}曜日）の実際の予定です。欠席・振替が反映された最新の状態を表示しています。</div>`;
  SLOTS.forEach(slot=>{
    const slotList = list.filter(a=>a.slot===slot.id);
    if(slotList.length===0) return;
    html += `<div class="match-slot"><div class="ms-slot-label">${slot.label}（${slot.time}）</div>`;
    const slotByTeacher = {};
    slotList.forEach(a=>{
      if(!slotByTeacher[a.teacherId]) slotByTeacher[a.teacherId] = [];
      slotByTeacher[a.teacherId].push(a);
    });
    Object.keys(slotByTeacher).forEach(teacherId=>{
      const teacher = S.teachers.find(t=>t.id===teacherId);
      const entries = slotByTeacher[teacherId];
      let studentsHtml = '';
      entries.forEach(a=>{
        const student = S.students.find(s=>s.id===a.studentId);
        const studentName = student ? student.name : '(削除された生徒)';
        const gLabel = student ? gradeLabel(student) : '';
        const level = student ? student.level : '';
        const c = level ? subjectColor(level, a.subject) : {bg:'#eee', text:'#333'};
        const makeupBadge = a.kind==='makeup' ? '<span class="auto-badge" style="background:#fff;color:var(--ink);border:1px dashed var(--ink);">振替</span>' : '';
        const handleBtn = a.kind==='normal' ? `<button class="handle-absence-btn" data-student="${a.studentId}" data-date="${dateStr}">欠席・振替の対応</button>` : '';
        studentsHtml += `<div class="sched-student-row">
          <span class="sched-student-tag" style="background:${c.bg};color:${c.text};">${a.subject}</span>
          <span>${studentName}<span class="grade-tag">${gLabel}</span></span>${makeupBadge}${handleBtn}
        </div>`;
      });
      html += `<div class="sched-teacher-box">
        <div class="sched-teacher-name">${teacherHonorific(teacher)}<span class="sched-cap">（${entries.length}/${S.teacherCapacity}）</span></div>
        ${studentsHtml}
      </div>`;
    });
    html += `</div>`;
  });
  wrap.innerHTML = html;

  wrap.querySelectorAll('.handle-absence-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      jumpToCalendarForDate(btn.dataset.student, btn.dataset.date);
    });
  });
}

// 月移動時に、カレンダー・マッチング系すべてに対象月の変更を反映する
// S.calYear/calMonthで選ばれている月に合わせて、週間予定の表示週を同期する
// 「今日」がその月に含まれるなら今日を含む週へ、そうでなければその月の1日を含む週へ
function computeSyncedWeekAnchor(year, month){
  const todayStr = getTodayStr();
  const todayDate = new Date(todayStr+'T00:00:00');
  if(todayDate.getFullYear()===year && todayDate.getMonth()===month){
    return getWeekMonday(todayStr);
  }
  return getWeekMonday(toDateStr(year, month, 1));
}

function syncMonthChange(){
  S.referenceYearMonth = `${S.calYear}-${pad2(S.calMonth+1)}`;
  // 週間予定の表示週（S.calWeekAnchor）は独立した状態のため、月間側の見出しとズレないよう毎回同期する
  S.calWeekAnchor = computeSyncedWeekAnchor(S.calYear, S.calMonth);
  renderCalendar();
  if(S.calMode==='week') renderCalendarWeek();
  renderTeacherScheduleTab();
  renderMatrix();
  renderMatching();
}

// =====================================================================

export { findCustomClosure, getDayStatus, shortName, buildDayCellLines, buildDayHeat, renderCalendar, refreshCalStudentFilterOptions, renderCalendarDetail, computeSyncedWeekAnchor, syncMonthChange };
