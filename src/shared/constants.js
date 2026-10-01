export const SUBJECT_MAP = {
  '小学': ['国語','算数','英語','理科','社会','プログラミング'],
  '中学': ['国語','数学','英語','理科','社会','プログラミング'],
  '高校': ['国語','数学','英語','理科','社会','プログラミング'],
};

/** 学年レベルの表示順（小学→中学→高校） */
export const LEVELS_ORDER = ['小学', '中学', '高校'];

export const LEVEL_ABBR = {'小学':'小', '中学':'中', '高校':'高'};

export const SUBJECT_ABBR = {'国語':'国', '算数':'算', '数学':'数', '英語':'英', '理科':'理', '社会':'社', 'プログラミング':'プ'};

/** 入会金・年会費・月ごとの費用の初めの金額（設定タブで教室ごとに変えられる） */
export const DEFAULT_STUDENT_FEES = {
  enrollment: 16500,
  registration: 11000,
  annual: 11000,
  annualMonthlyReduction: 1100,
  maintenance: 2750,
  elearning: 0,
};

export const DAYS = ['月','火','水','木','金','土'];

export const SLOTS = [
  {id:4, label:'4講', time:'14:50〜16:20'},
  {id:5, label:'5講', time:'16:40〜18:10'},
  {id:6, label:'6講', time:'18:20〜19:50'},
  {id:7, label:'7講', time:'20:00〜21:30'},
];

export const WEEKDAY_JP = ['日','月','火','水','木','金','土'];

export const WEEK_FULL = ['日','月','火','水','木','金','土'];
