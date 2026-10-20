import { GRADE_MAX_BY_LEVEL, LEVEL_ABBR } from '../shared/constants.js';

/** 高校はアドバンスだけ。ベーシックは小学・中学のみ */
const TUITION_COURSE_LEVELS = {
  basic: ['小学', '中学'],
  advance: ['小学', '中学', '高校'],
};

const DEFAULT_TUITION_BY_LEVEL = { '小学': 2900, '中学': 3900, '高校': 5200 };

function tuitionGradeKey(level, grade){
  return `${level}${grade}`;
}

/** 設定画面に並べる入力欄（コースごとに 区分→学年 の順） */
function tuitionGradeRows(course){
  return (TUITION_COURSE_LEVELS[course] || []).map(level=>({
    level,
    items: Array.from({ length: GRADE_MAX_BY_LEVEL[level] }, (_, i)=>({
      key: tuitionGradeKey(level, i + 1),
      label: `${LEVEL_ABBR[level]}${i + 1}`,
    })),
  }));
}

function validRate(v){
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * 保存データを学年別の単価にそろえる。
 * 学年別がまだ無い古いデータは、区分（小学・中学・高校）の単価を各学年にコピーする。
 */
function normalizeTuitionGradeRates(d){
  const saved = d?.tuitionGradeRates || {};
  const legacyBasic = d?.tuitionRates || {};
  const legacyAdvance = d?.tuitionRatesAdvance || legacyBasic;
  const legacy = { basic: legacyBasic, advance: legacyAdvance };
  const result = { basic: {}, advance: {} };
  Object.keys(TUITION_COURSE_LEVELS).forEach(course=>{
    tuitionGradeRows(course).forEach(({ level, items })=>{
      items.forEach(({ key })=>{
        result[course][key] = validRate(saved[course]?.[key])
          ?? validRate(legacy[course]?.[level])
          ?? DEFAULT_TUITION_BY_LEVEL[level];
      });
    });
  });
  return result;
}

/** 実際に料金計算に使うコース（高校生は常にアドバンス） */
function effectiveTuitionCourse(level, tuitionCourse){
  return level === '高校' || tuitionCourse === 'advance' ? 'advance' : 'basic';
}

/** 1コマの単価。学年が未設定・範囲外の古いデータは、その区分の1年（範囲外の上側は最終学年）で計算する */
function tuitionRateFor(rates, level, grade, tuitionCourse){
  const max = GRADE_MAX_BY_LEVEL[level];
  if(!max) return 0;
  const g = Number(grade);
  const safeGrade = Number.isFinite(g) && g >= 1 ? Math.min(Math.floor(g), max) : 1;
  const course = effectiveTuitionCourse(level, tuitionCourse);
  return Number(rates?.[course]?.[tuitionGradeKey(level, safeGrade)]) || 0;
}

function studentTuitionRate(rates, student){
  if(!student) return 0;
  return tuitionRateFor(rates, student.level, student.grade, student.tuitionCourse);
}

/** 小学40分だけ。小1〜小6。未入力は0円（90分の表はコピーしない）。 */
function shortTuitionGradeRows(){
  const level = '小学';
  return [{
    level,
    items: Array.from({ length: GRADE_MAX_BY_LEVEL[level] }, (_, i)=>({
      key: tuitionGradeKey(level, i + 1),
      label: `${LEVEL_ABBR[level]}${i + 1}`,
    })),
  }];
}

function normalizeShortTuitionRates(d){
  const saved = d?.tuitionGradeRatesShort || {};
  const result = { basic: {}, advance: {} };
  ['basic', 'advance'].forEach(course=>{
    shortTuitionGradeRows().forEach(({ items })=>{
      items.forEach(({ key })=>{
        result[course][key] = validRate(saved[course]?.[key]) ?? 0;
      });
    });
  });
  return result;
}

function studentShortTuitionRate(rates, student){
  if(!student || student.level !== '小学') return 0;
  return tuitionRateFor(rates, student.level, student.grade, student.tuitionCourse);
}

/** 1対1用。未入力は0円（2人授業の金額はコピーしない） */
function normalizeBlankGradeRates(saved, rowsFor){
  const result = { basic: {}, advance: {} };
  ['basic', 'advance'].forEach(course=>{
    rowsFor(course).forEach(({ items })=>{
      items.forEach(({ key })=>{
        result[course][key] = validRate(saved?.[course]?.[key]) ?? 0;
      });
    });
  });
  return result;
}

function normalizeOneTuitionRates(d){
  return normalizeBlankGradeRates(d?.tuitionGradeRatesOne, tuitionGradeRows);
}

function normalizeOneShortTuitionRates(d){
  return normalizeBlankGradeRates(d?.tuitionGradeRatesShortOne, ()=> shortTuitionGradeRows());
}

function tuitionDurationNote({ fullCount, shortCount, oneCount }){
  const base = shortCount && fullCount
    ? `90分が週${fullCount}コマ、40分が週${shortCount}コマです。`
    : (shortCount ? `1コマ40分です。週${shortCount}コマ` : `1コマ90分です。週${fullCount}コマ`);
  if(!oneCount) return base;
  const sep = base.endsWith('。') ? '' : '。';
  return `${base}${sep}1対1が週${oneCount}コマです。`;
}

export {
  tuitionGradeRows,
  normalizeTuitionGradeRates,
  shortTuitionGradeRows,
  normalizeShortTuitionRates,
  normalizeOneTuitionRates,
  normalizeOneShortTuitionRates,
  effectiveTuitionCourse,
  tuitionRateFor,
  studentTuitionRate,
  studentShortTuitionRate,
  tuitionDurationNote,
};
