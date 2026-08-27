import { SUBJECT_MAP, DAYS, SLOTS, WEEKDAY_JP, WEEK_FULL } from '../shared/constants.js';
import { HOLIDAYS_JP } from '../shared/holidays.js';
import { pad2, daysInYearMonth, toDateStr, getTodayStr } from '../shared/date-utils.js';
import { firebaseConfig, fbAuth, fbDb, STORAGE_KEY, getSecondaryAuth, S } from './state.js';
import { renderCalendar, syncMonthChange, refreshCalToolbarSecondary } from './calendar.js';
import { registerCalFilterUiSync, setCalFilterFromSelect } from './cal-filter.js';
import { initSearchComboboxes, refreshAllPersonComboboxes } from './filter-ui.js';
import { setSearchComboboxValue } from './search-combobox.js';
import { getWeekMonday, renderCalendarWeek, renderFinance, renderLegend, renderMatrix, switchCalMode, switchView, toggleCalMode } from './finance-ui.js';
import { buildStudentLevelArea, handleCourseStartDateChange, handleStudentSave, renderFormCourses, renderMatching, renderShortageDashboard, renderStudentList, resetStudentForm } from './matching.js';
import { initMatchingPanel } from './matching-panel.js';
import { mountInlineConfirm } from '../shared/inline-confirm.js';
import { addRaiseRow, buildBaseAvailArea, getOrCreateDraftSchedule, gradeLabel } from './schedule-core.js';
import { buildClosedDayArea, handleClosureSave, handleTermSave, initMatchingPrioritySettings, renderClosedDaySettings, renderClosureList, renderMatchingPrioritySettings, renderTermList, resetClosureForm, resetTermForm } from './settings.js';
import { loadStudents, saveAppState, saveTeacherScheduleDoc, scheduleSave, syncTeacherLoginUidEverywhere, clearAllMatchingData } from './students-persistence.js';
import { authDebugLog, wrapSecondaryAuthForDebug } from './auth-debug.js';
import { openTeacherScheduleEditor, renderTeacherScheduleTab } from './teacher-schedule-tab.js';
import { buildSubjectArea, buildSubjectFilterOptions, fillFormForEdit, handleSave, loadTeachers, renderTeacherList, resetForm, saveTeachers } from './teachers.js';
import { initOnboarding } from './onboarding.js';
import { takeGradePromotionNotice } from './grade-promotion.js';
import { showAppNoticeDialog } from '../shared/app-confirm-dialog.js';

function syncWeekAxisTabs(){
  document.querySelectorAll('.week-axis-btn').forEach(b=>{
    b.classList.toggle('active', b.dataset.axis === S.weekAxis);
  });
  const descEl = document.getElementById('calWeekDesc');
  if(!descEl) return;
  if(S.weekAxis === 'student'){
    descEl.textContent = 'マスの中身を生徒ごとの箱にし、各箱に担当講師を表示します。講師なしのコマもここに表示されます。';
  }else if(S.weekAxis === 'openings'){
    descEl.textContent = '各マスの上段に教科別の空き人数を表示します。講師名の下に教科タグを出したい場合は、右のチェックをオンにしてください。';
  }else{
    descEl.textContent = 'マスの中身を講師ごとの箱にし、各箱に担当している生徒を表示します。講師なしのコマは別枠で表示されます。';
  }
  refreshCalToolbarSecondary();
}

// ---------- init ----------
async function init(){
  initSearchComboboxes();
  registerCalFilterUiSync((value)=> setSearchComboboxValue('calFilter', value));
  buildSubjectArea();
  buildBaseAvailArea();
  buildSubjectFilterOptions();
  renderLegend();
  document.getElementById('matrixWrap').innerHTML = '<div class="loading">読み込み中…</div>';

  buildStudentLevelArea();
  document.getElementById('studentCourseStartInput').value = getTodayStr();
  renderFormCourses();
  document.getElementById('matchingWrap').innerHTML = '<div class="loading">読み込み中…</div>';
  document.getElementById('shortageWrap').innerHTML = '<div class="loading">読み込み中…</div>';
  document.getElementById('calWeekWrap').innerHTML = '<div class="loading">読み込み中…</div>';

  // 基本設定タブの初期値
  document.getElementById('teacherCapacityInput').value = String(S.teacherCapacity);
  document.getElementById('settingsRoomCapacityInput').value = String(S.roomCapacity);
  document.getElementById('tuitionSmallInput').value = String(S.tuitionRates['小学']);
  document.getElementById('tuitionMiddleInput').value = String(S.tuitionRates['中学']);
  document.getElementById('tuitionHighInput').value = String(S.tuitionRates['高校']);
  document.getElementById('finGradientMinInput').value = String(S.finGradientMin);
  document.getElementById('finGradientMaxInput').value = String(S.finGradientMax);
  document.getElementById('roomCapDisplay').textContent = String(S.roomCapacity);
  buildClosedDayArea();
  renderClosedDaySettings();
  initMatchingPrioritySettings();
  renderCalendar();
  document.getElementById('tsTeacherListWrap').innerHTML = '<div class="loading">読み込み中…</div>';

  document.querySelectorAll('.tab-btn').forEach(b=>{
    b.addEventListener('click', ()=>switchView(b.dataset.view));
  });
  document.getElementById('calModeToggleBtn').addEventListener('click', toggleCalMode);
  document.getElementById('calPrevBtn').addEventListener('click', ()=>{
    if(S.calMode==='week'){
      const d = new Date(S.calWeekAnchor+'T00:00:00');
      d.setDate(d.getDate()-7);
      S.calWeekAnchor = toDateStr(d.getFullYear(), d.getMonth(), d.getDate());
      renderCalendarWeek();
      return;
    }
    S.calMonth--;
    if(S.calMonth<0){ S.calMonth=11; S.calYear--; }
    document.getElementById('calDetailCard').style.display = 'none';
    S.calSelectedDate = null;
    syncMonthChange();
  });
  document.getElementById('calNextBtn').addEventListener('click', ()=>{
    if(S.calMode==='week'){
      const d = new Date(S.calWeekAnchor+'T00:00:00');
      d.setDate(d.getDate()+7);
      S.calWeekAnchor = toDateStr(d.getFullYear(), d.getMonth(), d.getDate());
      renderCalendarWeek();
      return;
    }
    S.calMonth++;
    if(S.calMonth>11){ S.calMonth=0; S.calYear++; }
    document.getElementById('calDetailCard').style.display = 'none';
    S.calSelectedDate = null;
    syncMonthChange();
  });
  document.getElementById('calTodayBtn').addEventListener('click', ()=>{
    if(S.calMode==='week'){
      S.calWeekAnchor = getWeekMonday(getTodayStr());
      renderCalendarWeek();
      return;
    }
    const t = new Date();
    S.calYear = t.getFullYear();
    S.calMonth = t.getMonth();
    document.getElementById('calDetailCard').style.display = 'none';
    S.calSelectedDate = null;
    syncMonthChange();
  });
  document.querySelectorAll('.week-axis-btn').forEach(b=>{
    b.addEventListener('click', ()=>{
      S.weekAxis = b.dataset.axis;
      syncWeekAxisTabs();
      renderCalendarWeek();
    });
  });
  document.getElementById('calOpeningsShowSubjectsToggle').addEventListener('change', (e)=>{
    S.calOpeningsShowSubjects = e.target.checked;
    if(S.calMode === 'week' && S.weekAxis === 'openings') renderCalendarWeek();
  });
  syncWeekAxisTabs();
  document.getElementById('finPrevBtn').addEventListener('click', ()=>{
    S.finMonth--;
    if(S.finMonth<0){ S.finMonth=11; S.finYear--; }
    renderFinance();
  });
  document.getElementById('finNextBtn').addEventListener('click', ()=>{
    S.finMonth++;
    if(S.finMonth>11){ S.finMonth=0; S.finYear++; }
    renderFinance();
  });
  document.getElementById('finTodayBtn').addEventListener('click', ()=>{
    const t = new Date();
    S.finYear = t.getFullYear();
    S.finMonth = t.getMonth();
    renderFinance();
  });
  document.querySelectorAll('.fin-transport-btn').forEach(b=>{
    b.addEventListener('click', ()=>{
      S.finIncludeTransport = (b.dataset.transport === 'include');
      document.querySelectorAll('.fin-transport-btn').forEach(x=>x.classList.toggle('active', x===b));
      document.getElementById('finDesc').textContent = S.finIncludeTransport
        ? '各日のマスは「講師コスト（コマ給＋交通費）÷ 売上 × 100%」を表示しています。右端の「週計」列は1週間単位の合計です。'
        : '各日のマスは「講師コスト（コマ給のみ・交通費を含まない）÷ 売上 × 100%」を表示しています。右端の「週計」列は1週間単位の合計です。';
      renderFinance();
    });
  });
  document.getElementById('earlyExceptionToggle').addEventListener('change', (e)=>{
    document.getElementById('earlyExceptionArea').style.display = e.target.checked ? 'flex' : 'none';
  });
  document.getElementById('raiseScheduleToggle').addEventListener('change', (e)=>{
    document.getElementById('raiseScheduleArea').style.display = e.target.checked ? 'block' : 'none';
    if(e.target.checked && S.formRaiseSchedule.length===0) addRaiseRow();
  });
  document.getElementById('addRaiseBtn').addEventListener('click', ()=>{ addRaiseRow(); });
  document.getElementById('createTeacherLoginBtn').addEventListener('click', async ()=>{
    const msg = document.getElementById('teacherLoginMsg');
    if(!S.editingId){ msg.textContent = '先に講師情報を登録してください。'; return; }
    const email = document.getElementById('teacherLoginEmail').value.trim();
    const password = document.getElementById('teacherLoginPassword').value;
    if(!email){ msg.textContent = 'メールアドレスを入力してください。'; return; }
    if(!password || password.length<6){ msg.textContent = 'パスワードは6文字以上で入力してください。'; return; }
    msg.textContent = '発行中…';
    try{
      wrapSecondaryAuthForDebug();
      const secAuth = getSecondaryAuth();
      const cred = await secAuth.createUserWithEmailAndPassword(email, password);
      const newUid = cred.user.uid;
      authDebugLog('講師アカウント発行完了', { newUid: newUid.slice(0, 8) + '…' });
      await secAuth.signOut(); // 一時的な接続からはサインアウトする（教室長のログインには影響しない）

      const adminUid = fbAuth.currentUser.uid;
      await fbDb.collection('teacherAccounts').doc(newUid).set({
        adminUid, teacherId: S.editingId, teacherName: document.getElementById('nameInput').value.trim(),
      });

      const idx = S.teachers.findIndex(t=>t.id===S.editingId);
      if(idx>-1){
        S.teachers[idx].loginUid = newUid;
        S.teachers[idx].loginEmail = email;
      }
      // ここは通常のデバウンス保存（scheduleSave）ではなく、即座に確実な保存を行う
      // （デバウンス中にページを離れると、講師一覧側のloginUidだけが保存されず取り残されるため）
      await saveAppState();
      await syncTeacherLoginUidEverywhere(S.editingId, newUid);
      renderTeacherList();
      msg.textContent = '✓ アカウントを発行しました。URLとログイン情報を講師ご本人に共有してください。';
      document.getElementById('teacherLoginStatus').textContent = `発行済み（${email}）。パスワードを変更したい場合は、新しいパスワードを入力して再度発行してください。`;
      document.getElementById('teacherLoginStatus').className = 'login-status-box issued';
    }catch(err){
      let text = 'アカウントの発行に失敗しました。';
      if(err.code==='auth/email-already-in-use'){
        // 既にこのメールアドレスでアカウントが存在する場合、teacherAccountsから
        // 「この講師に紐づくログインID」を逆引きし、教室長側のデータを自動修復できないか試みる
        text = 'このメールアドレスは既に使われています。';
        try{
          const adminUid = fbAuth.currentUser.uid;
          const snap = await fbDb.collection('teacherAccounts')
            .where('adminUid','==',adminUid).where('teacherId','==',S.editingId).get();
          if(!snap.empty){
            const foundUid = snap.docs[0].id;
            const idx = S.teachers.findIndex(t=>t.id===S.editingId);
            if(idx>-1){
              S.teachers[idx].loginUid = foundUid;
              S.teachers[idx].loginEmail = email;
            }
            await saveAppState();
            await syncTeacherLoginUidEverywhere(S.editingId, foundUid);
            renderTeacherList();
            fillFormForEdit(S.teachers[idx]);
            text = '✓ 既存のアカウントとの紐付けを自動的に復元しました。';
          }
        }catch(e2){
          console.error('自動復旧エラー:', e2);
        }
      }
      if(err.code==='auth/invalid-email') text = 'メールアドレスの形式が正しくありません。';
      if(err.code==='auth/weak-password') text = 'パスワードが簡単すぎます。6文字以上の別の文字列にしてください。';
      msg.textContent = text;
    }
  });
  document.getElementById('resyncTeacherLoginBtn').addEventListener('click', async ()=>{
    const msg = document.getElementById('teacherLoginMsg');
    const teacherId = document.getElementById('resyncTeacherLoginBtn').dataset.teacherId;
    const loginUid = document.getElementById('resyncTeacherLoginBtn').dataset.loginUid;
    if(!teacherId || !loginUid) return;
    msg.textContent = '再同期中…';
    try{
      await syncTeacherLoginUidEverywhere(teacherId, loginUid);
      msg.textContent = '✓ 再同期しました。講師専用ページを開き直して確認してください。';
    }catch(e){
      console.error('再同期エラー:', e);
      msg.textContent = '再同期に失敗しました。Firestoreのルールが正しく公開されているかご確認ください。';
    }
  });
  document.getElementById('saveBtn').addEventListener('click', handleSave);
  document.getElementById('bulkPayEarlyToggle').addEventListener('change', (e)=>{
    document.getElementById('bulkPayEarlyArea').style.display = e.target.checked ? 'flex' : 'none';
  });
  document.getElementById('bulkPayApplyBtn').addEventListener('click', async ()=>{
    const msg = document.getElementById('bulkPayMsg');
    if(S.teachers.length===0){ msg.textContent = '講師が1人も登録されていません。'; return; }
    let rate = parseInt(document.getElementById('bulkPayRateInput').value, 10);
    if(!Number.isFinite(rate) || rate<0){ msg.textContent = 'コマ単価を入力してください。'; return; }

    let earlyLessonException = null;
    if(document.getElementById('bulkPayEarlyToggle').checked){
      let cnt = parseInt(document.getElementById('bulkPayEarlyCount').value, 10);
      let earlyRate = parseInt(document.getElementById('bulkPayEarlyRate').value, 10);
      if(!Number.isFinite(cnt) || cnt<=0){ msg.textContent = '特別単価の対象コマ数を入力してください。'; return; }
      if(!Number.isFinite(earlyRate) || earlyRate<0) earlyRate = 0;
      earlyLessonException = {lessonCount: cnt, rate: earlyRate};
    }

    S.teachers.forEach(t=>{
      t.perLessonRate = rate;
      t.earlyLessonException = earlyLessonException;
    });
    msg.textContent = '保存中…';
    await saveTeachers();
    renderTeacherList();
    renderMatrix();
    renderMatching();
    msg.textContent = `${S.teachers.length}名に適用しました。`;
  });
  document.getElementById('cancelBtn').addEventListener('click', resetForm);
  document.getElementById('subjectFilter').addEventListener('change', renderMatrix);
  document.getElementById('studentSaveBtn').addEventListener('click', handleStudentSave);
  document.getElementById('studentCancelBtn').addEventListener('click', resetStudentForm);
  document.getElementById('studentCourseStartInput').addEventListener('change', handleCourseStartDateChange);
  document.getElementById('teacherCapacityInput').addEventListener('change', (e)=>{
    let v = parseInt(e.target.value, 10);
    if(!Number.isFinite(v) || v < 1) v = 1;
    S.teacherCapacity = v;
    e.target.value = String(v);
    renderMatching();
    scheduleSave();
  });
  document.getElementById('settingsRoomCapacityInput').addEventListener('change', (e)=>{
    let v = parseInt(e.target.value, 10);
    if(!Number.isFinite(v) || v < 1) v = 1;
    S.roomCapacity = v;
    e.target.value = String(v);
    document.getElementById('roomCapDisplay').textContent = String(v);
    renderMatching();
    scheduleSave();
  });
  const tuitionInputMap = [
    ['tuitionSmallInput','小学'], ['tuitionMiddleInput','中学'], ['tuitionHighInput','高校']
  ];
  tuitionInputMap.forEach(([id, level])=>{
    document.getElementById(id).addEventListener('change', (e)=>{
      let v = parseInt(e.target.value, 10);
      if(!Number.isFinite(v) || v < 0) v = 0;
      S.tuitionRates[level] = v;
      e.target.value = String(v);
      if(typeof renderFinance === 'function') renderFinance();
      scheduleSave();
    });
  });
  document.getElementById('finGradientMinInput').addEventListener('change', (e)=>{
    let v = parseInt(e.target.value, 10);
    if(!Number.isFinite(v) || v < 0) v = 0;
    S.finGradientMin = v;
    if(S.finGradientMax <= S.finGradientMin) S.finGradientMax = S.finGradientMin + 1;
    e.target.value = String(v);
    document.getElementById('finGradientMaxInput').value = String(S.finGradientMax);
    renderFinance();
    scheduleSave();
  });
  document.getElementById('finGradientMaxInput').addEventListener('change', (e)=>{
    let v = parseInt(e.target.value, 10);
    if(!Number.isFinite(v) || v <= S.finGradientMin) v = S.finGradientMin + 1;
    S.finGradientMax = v;
    e.target.value = String(v);
    renderFinance();
    scheduleSave();
  });
  document.getElementById('calFilter').addEventListener('change', (e)=>{
    setCalFilterFromSelect(e.target.value);
    document.getElementById('calDetailCard').style.display = 'none';
    S.calSelectedDate = null;
    refreshCalToolbarSecondary();
    if(S.calMode==='week') renderCalendarWeek();
    else renderCalendar();
  });
  document.getElementById('teacherListFilter')?.addEventListener('change', ()=>{
    renderTeacherList();
  });
  document.getElementById('studentListFilter')?.addEventListener('change', ()=>{
    renderStudentList();
  });
  document.getElementById('tsPrevBtn').addEventListener('click', ()=>{
    S.calMonth--;
    if(S.calMonth<0){ S.calMonth=11; S.calYear--; }
    document.getElementById('tsEditCard').style.display = 'none';
    S.tsSelectedTeacherId = null;
    syncMonthChange();
  });
  document.getElementById('tsNextBtn').addEventListener('click', ()=>{
    S.calMonth++;
    if(S.calMonth>11){ S.calMonth=0; S.calYear++; }
    document.getElementById('tsEditCard').style.display = 'none';
    S.tsSelectedTeacherId = null;
    syncMonthChange();
  });
  document.getElementById('tsTodayBtn').addEventListener('click', ()=>{
    const t = new Date();
    S.calYear = t.getFullYear();
    S.calMonth = t.getMonth();
    document.getElementById('tsEditCard').style.display = 'none';
    S.tsSelectedTeacherId = null;
    syncMonthChange();
  });
  document.getElementById('tsSubmitBtn').addEventListener('click', async ()=>{
    if(!S.tsSelectedTeacherId) return;
    const yearMonth = `${S.calYear}-${pad2(S.calMonth+1)}`;
    const schedule = getOrCreateDraftSchedule(S.tsSelectedTeacherId, yearMonth);
    schedule.status = 'submitted';
    schedule.submittedBy = 'admin'; // 教室長が代理で入力・提出したことを記録
    await saveTeacherScheduleDoc(schedule);
    document.getElementById('tsFormMsg').textContent = '✓ 提出しました。';
    renderTeacherScheduleTab();
    openTeacherScheduleEditor(S.tsSelectedTeacherId);
    document.getElementById('tsFormMsg').textContent = '✓ 提出しました。';
    renderMatrix();
    renderMatching();
    renderCalendar();
  });
  document.getElementById('tsCloseBtn').addEventListener('click', ()=>{
    document.getElementById('tsEditCard').style.display = 'none';
    S.tsSelectedTeacherId = null;
    renderTeacherScheduleTab();
  });
  document.getElementById('termSaveBtn').addEventListener('click', handleTermSave);
  document.getElementById('termCancelBtn').addEventListener('click', resetTermForm);
  document.getElementById('holidayAutoDetectToggle').addEventListener('change', (e)=>{
    S.holidayAutoDetect = e.target.checked;
    renderClosedDaySettings();
    renderCalendar();
  });
  document.getElementById('closureSaveBtn').addEventListener('click', handleClosureSave);
  document.getElementById('closureCancelBtn').addEventListener('click', resetClosureForm);
  document.getElementById('settingsClearMatchingBtn')?.addEventListener('click', (ev)=>{
    const btn = ev.currentTarget;
    const card = btn.closest('.card');
    const resultEl = document.getElementById('settingsClearMatchingResult');
    const totalCount = S.assignments.length + S.pendingAssignments.length + S.draftAssignments.length
      + S.absences.length + S.teacherAbsences.length + S.teacherSubstitutions.length;
    if(totalCount === 0){
      if(resultEl) resultEl.textContent = 'マッチングデータはありません。';
      return;
    }
    if(!card) return;
    mountInlineConfirm(card, btn, {
      message: `確定・承認待ち・下書き・欠席・代講を含む${totalCount}件のデータをすべて削除しますか？\n（生徒・講師・シフトの登録は残ります）`,
      confirmLabel: 'すべて削除',
      variant: 'danger',
      onConfirm: async ()=>{
        await clearAllMatchingData();
        renderMatching();
        renderShortageDashboard();
        renderCalendar();
        if(resultEl) resultEl.textContent = 'マッチングデータをすべて削除しました。';
        return { ok: true };
      },
    });
  });
  document.getElementById('shortageToggleBtn').addEventListener('click', ()=>{
    const detail = document.getElementById('shortageDetailWrap');
    const btn = document.getElementById('shortageToggleBtn');
    const chevron = btn.querySelector('.cal-status-chevron');
    const isOpen = detail.style.display !== 'none';
    detail.style.display = isOpen ? 'none' : 'block';
    btn.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
    if(chevron) chevron.textContent = isOpen ? '▾' : '▴';
  });
  document.getElementById('shiftStatusToggleBtn').addEventListener('click', ()=>{
    const detail = document.getElementById('shiftStatusDetailWrap');
    const btn = document.getElementById('shiftStatusToggleBtn');
    const chevron = btn.querySelector('.cal-status-chevron');
    const isOpen = detail.style.display !== 'none';
    detail.style.display = isOpen ? 'none' : 'block';
    btn.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
    if(chevron) chevron.textContent = isOpen ? '▾' : '▴';
  });
  initMatchingPanel();

  await loadTeachers();
  await loadStudents();
  refreshAllPersonComboboxes();
  renderTeacherList();
  renderStudentList();
  renderMatrix();
  renderMatching();
  renderTermList();
  renderClosureList();
  renderCalendar();
  renderFinance();
  initOnboarding();
  const gradeNotice = takeGradePromotionNotice();
  if(gradeNotice){
    showAppNoticeDialog({
      title: '今年度の進級',
      message: gradeNotice,
      confirmLabel: 'OK',
    });
  }
}


export { init };
