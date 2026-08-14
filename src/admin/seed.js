/**
 * テスト用サンプルデータ（開発・デモ専用）
 * 本番の Firebase データ読み込みでは使用しません。
 * 参照が必要な場合のみ import してください。
 */

// ---------- 講師データ（テスト用シードデータ：講師8名） ----------
const HARDCODED_TEACHERS = [
  {id:'demo-1', name:'佐藤 健太', subjects:[{level:'小学',subject:'国語',preferred:false}, {level:'小学',subject:'算数',preferred:true}, {level:'小学',subject:'英語',preferred:false}, {level:'小学',subject:'理科',preferred:true}, {level:'小学',subject:'社会',preferred:false}, {level:'中学',subject:'数学',preferred:true}], perLessonRate:2200, dailyTransport:0},
  {id:'demo-2', name:'鈴木 愛', subjects:[{level:'中学',subject:'国語',preferred:true}, {level:'中学',subject:'数学',preferred:false}, {level:'中学',subject:'英語',preferred:true}, {level:'中学',subject:'理科',preferred:false}, {level:'中学',subject:'社会',preferred:false}], perLessonRate:2200, dailyTransport:440},
  {id:'demo-3', name:'高橋 翔太', subjects:[{level:'小学',subject:'国語',preferred:false}, {level:'小学',subject:'算数',preferred:false}, {level:'高校',subject:'国語',preferred:true}, {level:'高校',subject:'数学',preferred:false}, {level:'高校',subject:'英語',preferred:false}, {level:'高校',subject:'理科',preferred:false}, {level:'高校',subject:'社会',preferred:true}], perLessonRate:2200, dailyTransport:480},
  {id:'demo-4', name:'田中 美咲', subjects:[{level:'高校',subject:'数学',preferred:true}, {level:'高校',subject:'英語',preferred:false}, {level:'高校',subject:'理科',preferred:false}, {level:'中学',subject:'数学',preferred:true}, {level:'中学',subject:'英語',preferred:false}], perLessonRate:2200, dailyTransport:380},
  {id:'demo-5', name:'伊藤 大輝', subjects:[{level:'小学',subject:'算数',preferred:false}, {level:'小学',subject:'理科',preferred:false}, {level:'小学',subject:'社会',preferred:false}, {level:'中学',subject:'理科',preferred:true}, {level:'中学',subject:'社会',preferred:false}], perLessonRate:2200, dailyTransport:420},
  {id:'demo-6', name:'渡辺 さくら', subjects:[{level:'小学',subject:'国語',preferred:true}, {level:'小学',subject:'算数',preferred:false}, {level:'小学',subject:'英語',preferred:true}, {level:'小学',subject:'理科',preferred:false}, {level:'小学',subject:'社会',preferred:false}], perLessonRate:2200, dailyTransport:400},
  {id:'demo-7', name:'中村 蓮', subjects:[{level:'中学',subject:'国語',preferred:false}, {level:'中学',subject:'英語',preferred:false}, {level:'中学',subject:'社会',preferred:true}, {level:'高校',subject:'国語',preferred:false}, {level:'高校',subject:'英語',preferred:true}, {level:'高校',subject:'社会',preferred:false}], perLessonRate:2200, dailyTransport:480},
  {id:'demo-8', name:'小林 陽菜', subjects:[{level:'小学',subject:'国語',preferred:false}, {level:'小学',subject:'英語',preferred:false}, {level:'中学',subject:'数学',preferred:false}, {level:'中学',subject:'理科',preferred:true}, {level:'高校',subject:'数学',preferred:false}], perLessonRate:2200, dailyTransport:320},
];

const HARDCODED_TEACHER_SCHEDULES = [
  {id:'tsch-demo-1', teacherId:'demo-1', yearMonth:'2026-08', status:'submitted', days:{'2026-08-03':[{slot:4,priority:'preferred'},{slot:5,priority:'normal'}], '2026-08-04':[{slot:4,priority:'normal'},{slot:5,priority:'normal'}], '2026-08-06':[{slot:4,priority:'normal'},{slot:5,priority:'normal'}], '2026-08-07':[{slot:4,priority:'normal'},{slot:5,priority:'normal'}], '2026-08-10':[{slot:4,priority:'preferred'},{slot:5,priority:'normal'}], '2026-08-11':[{slot:4,priority:'normal'},{slot:5,priority:'normal'}], '2026-08-13':[{slot:4,priority:'normal'},{slot:5,priority:'normal'}], '2026-08-14':[{slot:4,priority:'normal'},{slot:5,priority:'normal'}], '2026-08-17':[{slot:4,priority:'preferred'},{slot:5,priority:'normal'}], '2026-08-18':[{slot:4,priority:'normal'},{slot:5,priority:'normal'}], '2026-08-20':[{slot:4,priority:'normal'},{slot:5,priority:'normal'}], '2026-08-21':[{slot:4,priority:'normal'},{slot:5,priority:'normal'}], '2026-08-24':[{slot:4,priority:'preferred'},{slot:5,priority:'normal'}], '2026-08-25':[{slot:4,priority:'normal'},{slot:5,priority:'normal'}], '2026-08-27':[{slot:4,priority:'normal'},{slot:5,priority:'normal'}], '2026-08-28':[{slot:4,priority:'normal'},{slot:5,priority:'normal'}], '2026-08-31':[{slot:4,priority:'preferred'},{slot:5,priority:'normal'}]}},
  {id:'tsch-demo-2', teacherId:'demo-2', yearMonth:'2026-08', status:'submitted', days:{'2026-08-01':[{slot:6,priority:'normal'},{slot:7,priority:'normal'}], '2026-08-03':[{slot:4,priority:'normal'},{slot:5,priority:'preferred'}], '2026-08-05':[{slot:4,priority:'normal'},{slot:5,priority:'normal'}], '2026-08-07':[{slot:4,priority:'normal'},{slot:5,priority:'normal'}], '2026-08-08':[{slot:6,priority:'normal'},{slot:7,priority:'normal'}], '2026-08-10':[{slot:4,priority:'normal'},{slot:5,priority:'preferred'}], '2026-08-12':[{slot:4,priority:'normal'},{slot:5,priority:'normal'}], '2026-08-14':[{slot:4,priority:'normal'},{slot:5,priority:'normal'}], '2026-08-15':[{slot:6,priority:'normal'},{slot:7,priority:'normal'}], '2026-08-17':[{slot:4,priority:'normal'},{slot:5,priority:'preferred'}], '2026-08-19':[{slot:4,priority:'normal'},{slot:5,priority:'normal'}], '2026-08-21':[{slot:4,priority:'normal'},{slot:5,priority:'normal'}], '2026-08-22':[{slot:6,priority:'normal'},{slot:7,priority:'normal'}], '2026-08-24':[{slot:4,priority:'normal'},{slot:5,priority:'preferred'}], '2026-08-26':[{slot:4,priority:'normal'},{slot:5,priority:'normal'}], '2026-08-28':[{slot:4,priority:'normal'},{slot:5,priority:'normal'}], '2026-08-29':[{slot:6,priority:'normal'},{slot:7,priority:'normal'}], '2026-08-31':[{slot:4,priority:'normal'},{slot:5,priority:'preferred'}]}},
  {id:'tsch-demo-3', teacherId:'demo-3', yearMonth:'2026-08', status:'submitted', days:{'2026-08-01':[{slot:4,priority:'preferred'},{slot:5,priority:'normal'},{slot:6,priority:'normal'}], '2026-08-04':[{slot:5,priority:'normal'},{slot:6,priority:'normal'}], '2026-08-05':[{slot:5,priority:'normal'},{slot:6,priority:'normal'}], '2026-08-06':[{slot:5,priority:'normal'},{slot:6,priority:'normal'}], '2026-08-08':[{slot:4,priority:'preferred'},{slot:5,priority:'normal'},{slot:6,priority:'normal'}], '2026-08-11':[{slot:5,priority:'normal'},{slot:6,priority:'normal'}], '2026-08-12':[{slot:5,priority:'normal'},{slot:6,priority:'normal'}], '2026-08-13':[{slot:5,priority:'normal'},{slot:6,priority:'normal'}], '2026-08-15':[{slot:4,priority:'preferred'},{slot:5,priority:'normal'},{slot:6,priority:'normal'}], '2026-08-18':[{slot:5,priority:'normal'},{slot:6,priority:'normal'}], '2026-08-19':[{slot:5,priority:'normal'},{slot:6,priority:'normal'}], '2026-08-20':[{slot:5,priority:'normal'},{slot:6,priority:'normal'}], '2026-08-22':[{slot:4,priority:'preferred'},{slot:5,priority:'normal'},{slot:6,priority:'normal'}], '2026-08-25':[{slot:5,priority:'normal'},{slot:6,priority:'normal'}], '2026-08-26':[{slot:5,priority:'normal'},{slot:6,priority:'normal'}], '2026-08-27':[{slot:5,priority:'normal'},{slot:6,priority:'normal'}], '2026-08-29':[{slot:4,priority:'preferred'},{slot:5,priority:'normal'},{slot:6,priority:'normal'}]}},
  {id:'tsch-demo-4', teacherId:'demo-4', yearMonth:'2026-08', status:'submitted', days:{'2026-08-03':[{slot:6,priority:'normal'},{slot:7,priority:'normal'}], '2026-08-04':[{slot:6,priority:'preferred'},{slot:7,priority:'normal'}], '2026-08-06':[{slot:6,priority:'normal'},{slot:7,priority:'normal'}], '2026-08-07':[{slot:6,priority:'normal'},{slot:7,priority:'normal'}], '2026-08-10':[{slot:6,priority:'normal'},{slot:7,priority:'normal'}], '2026-08-11':[{slot:6,priority:'preferred'},{slot:7,priority:'normal'}], '2026-08-13':[{slot:6,priority:'normal'},{slot:7,priority:'normal'}], '2026-08-14':[{slot:6,priority:'normal'},{slot:7,priority:'normal'}], '2026-08-17':[{slot:6,priority:'normal'},{slot:7,priority:'normal'}], '2026-08-18':[{slot:6,priority:'preferred'},{slot:7,priority:'normal'}], '2026-08-20':[{slot:6,priority:'normal'},{slot:7,priority:'normal'}], '2026-08-21':[{slot:6,priority:'normal'},{slot:7,priority:'normal'}], '2026-08-24':[{slot:6,priority:'normal'},{slot:7,priority:'normal'}], '2026-08-25':[{slot:6,priority:'preferred'},{slot:7,priority:'normal'}], '2026-08-27':[{slot:6,priority:'normal'},{slot:7,priority:'normal'}], '2026-08-28':[{slot:6,priority:'normal'},{slot:7,priority:'normal'}], '2026-08-31':[{slot:6,priority:'normal'},{slot:7,priority:'normal'}]}},
  {id:'tsch-demo-5', teacherId:'demo-5', yearMonth:'2026-08', status:'submitted', days:{'2026-08-01':[{slot:4,priority:'normal'},{slot:5,priority:'normal'}], '2026-08-03':[{slot:4,priority:'normal'},{slot:5,priority:'normal'},{slot:6,priority:'normal'}], '2026-08-05':[{slot:4,priority:'normal'},{slot:5,priority:'preferred'},{slot:6,priority:'normal'}], '2026-08-07':[{slot:4,priority:'normal'},{slot:5,priority:'normal'},{slot:6,priority:'normal'}], '2026-08-08':[{slot:4,priority:'normal'},{slot:5,priority:'normal'}], '2026-08-10':[{slot:4,priority:'normal'},{slot:5,priority:'normal'},{slot:6,priority:'normal'}], '2026-08-12':[{slot:4,priority:'normal'},{slot:5,priority:'preferred'},{slot:6,priority:'normal'}], '2026-08-14':[{slot:4,priority:'normal'},{slot:5,priority:'normal'},{slot:6,priority:'normal'}], '2026-08-15':[{slot:4,priority:'normal'},{slot:5,priority:'normal'}], '2026-08-17':[{slot:4,priority:'normal'},{slot:5,priority:'normal'},{slot:6,priority:'normal'}], '2026-08-19':[{slot:4,priority:'normal'},{slot:5,priority:'preferred'},{slot:6,priority:'normal'}], '2026-08-21':[{slot:4,priority:'normal'},{slot:5,priority:'normal'},{slot:6,priority:'normal'}], '2026-08-22':[{slot:4,priority:'normal'},{slot:5,priority:'normal'}], '2026-08-24':[{slot:4,priority:'normal'},{slot:5,priority:'normal'},{slot:6,priority:'normal'}], '2026-08-26':[{slot:4,priority:'normal'},{slot:5,priority:'preferred'},{slot:6,priority:'normal'}], '2026-08-28':[{slot:4,priority:'normal'},{slot:5,priority:'normal'},{slot:6,priority:'normal'}], '2026-08-29':[{slot:4,priority:'normal'},{slot:5,priority:'normal'}], '2026-08-31':[{slot:4,priority:'normal'},{slot:5,priority:'normal'},{slot:6,priority:'normal'}]}},
  {id:'tsch-demo-6', teacherId:'demo-6', yearMonth:'2026-08', status:'submitted', days:{'2026-08-01':[{slot:4,priority:'normal'},{slot:5,priority:'normal'}], '2026-08-03':[{slot:4,priority:'normal'}], '2026-08-04':[{slot:4,priority:'normal'}], '2026-08-05':[{slot:4,priority:'preferred'}], '2026-08-06':[{slot:4,priority:'normal'}], '2026-08-07':[{slot:4,priority:'normal'}], '2026-08-08':[{slot:4,priority:'normal'},{slot:5,priority:'normal'}], '2026-08-10':[{slot:4,priority:'normal'}], '2026-08-11':[{slot:4,priority:'normal'}], '2026-08-12':[{slot:4,priority:'preferred'}], '2026-08-13':[{slot:4,priority:'normal'}], '2026-08-14':[{slot:4,priority:'normal'}], '2026-08-15':[{slot:4,priority:'normal'},{slot:5,priority:'normal'}], '2026-08-17':[{slot:4,priority:'normal'}], '2026-08-18':[{slot:4,priority:'normal'}], '2026-08-19':[{slot:4,priority:'preferred'}], '2026-08-20':[{slot:4,priority:'normal'}], '2026-08-21':[{slot:4,priority:'normal'}], '2026-08-22':[{slot:4,priority:'normal'},{slot:5,priority:'normal'}], '2026-08-24':[{slot:4,priority:'normal'}], '2026-08-25':[{slot:4,priority:'normal'}], '2026-08-26':[{slot:4,priority:'preferred'}], '2026-08-27':[{slot:4,priority:'normal'}], '2026-08-28':[{slot:4,priority:'normal'}], '2026-08-29':[{slot:4,priority:'normal'},{slot:5,priority:'normal'}], '2026-08-31':[{slot:4,priority:'normal'}]}},
  {id:'tsch-demo-7', teacherId:'demo-7', yearMonth:'2026-08', status:'submitted', days:{'2026-08-04':[{slot:5,priority:'preferred'},{slot:6,priority:'normal'},{slot:7,priority:'normal'}], '2026-08-05':[{slot:5,priority:'normal'},{slot:6,priority:'normal'},{slot:7,priority:'normal'}], '2026-08-06':[{slot:5,priority:'normal'},{slot:6,priority:'normal'},{slot:7,priority:'normal'}], '2026-08-11':[{slot:5,priority:'preferred'},{slot:6,priority:'normal'},{slot:7,priority:'normal'}], '2026-08-12':[{slot:5,priority:'normal'},{slot:6,priority:'normal'},{slot:7,priority:'normal'}], '2026-08-13':[{slot:5,priority:'normal'},{slot:6,priority:'normal'},{slot:7,priority:'normal'}], '2026-08-18':[{slot:5,priority:'preferred'},{slot:6,priority:'normal'},{slot:7,priority:'normal'}], '2026-08-19':[{slot:5,priority:'normal'},{slot:6,priority:'normal'},{slot:7,priority:'normal'}], '2026-08-20':[{slot:5,priority:'normal'},{slot:6,priority:'normal'},{slot:7,priority:'normal'}], '2026-08-25':[{slot:5,priority:'preferred'},{slot:6,priority:'normal'},{slot:7,priority:'normal'}], '2026-08-26':[{slot:5,priority:'normal'},{slot:6,priority:'normal'},{slot:7,priority:'normal'}], '2026-08-27':[{slot:5,priority:'normal'},{slot:6,priority:'normal'},{slot:7,priority:'normal'}]}},
  {id:'tsch-demo-8', teacherId:'demo-8', yearMonth:'2026-08', status:'submitted', days:{'2026-08-01':[{slot:4,priority:'normal'},{slot:5,priority:'normal'}], '2026-08-03':[{slot:6,priority:'normal'},{slot:7,priority:'normal'}], '2026-08-05':[{slot:6,priority:'normal'},{slot:7,priority:'normal'}], '2026-08-07':[{slot:6,priority:'normal'},{slot:7,priority:'preferred'}], '2026-08-08':[{slot:4,priority:'normal'},{slot:5,priority:'normal'}], '2026-08-10':[{slot:6,priority:'normal'},{slot:7,priority:'normal'}], '2026-08-12':[{slot:6,priority:'normal'},{slot:7,priority:'normal'}], '2026-08-14':[{slot:6,priority:'normal'},{slot:7,priority:'preferred'}], '2026-08-15':[{slot:4,priority:'normal'},{slot:5,priority:'normal'}], '2026-08-17':[{slot:6,priority:'normal'},{slot:7,priority:'normal'}], '2026-08-19':[{slot:6,priority:'normal'},{slot:7,priority:'normal'}], '2026-08-21':[{slot:6,priority:'normal'},{slot:7,priority:'preferred'}], '2026-08-22':[{slot:4,priority:'normal'},{slot:5,priority:'normal'}], '2026-08-24':[{slot:6,priority:'normal'},{slot:7,priority:'normal'}], '2026-08-26':[{slot:6,priority:'normal'},{slot:7,priority:'normal'}], '2026-08-28':[{slot:6,priority:'normal'},{slot:7,priority:'preferred'}], '2026-08-29':[{slot:4,priority:'normal'},{slot:5,priority:'normal'}], '2026-08-31':[{slot:6,priority:'normal'},{slot:7,priority:'normal'}]}},
];

// ---------- 生徒データ（テスト用シードデータ：生徒20名） ----------
const HARDCODED_STUDENTS = [
  {
    id:'stu-1', name:'山田 花子', level:'小学', grade:4,
    courses:[
      {id:'stu-1-c1', subject:'国語', weeklyCount:2, desiredSlots:[{day:'水',slot:6},{day:'木',slot:5}]},
      {id:'stu-1-c2', subject:'社会', weeklyCount:1, desiredSlots:[{day:'月',slot:5}]}
    ]
  },
  {
    id:'stu-2', name:'木村 蓮', level:'小学', grade:6,
    courses:[
      {id:'stu-2-c1', subject:'算数', weeklyCount:1, desiredSlots:[{day:'月',slot:4}]}
    ]
  },
  {
    id:'stu-3', name:'松本 陽菜', level:'小学', grade:4,
    courses:[
      {id:'stu-3-c1', subject:'国語', weeklyCount:2, desiredSlots:[{day:'月',slot:6},{day:'火',slot:4}]},
      {id:'stu-3-c2', subject:'社会', weeklyCount:1, desiredSlots:[{day:'木',slot:4}]}
    ]
  },
  {
    id:'stu-4', name:'井上 大和', level:'小学', grade:6,
    courses:[
      {id:'stu-4-c1', subject:'国語', weeklyCount:1, desiredSlots:[{day:'火',slot:4}]}
    ]
  },
  {
    id:'stu-5', name:'林美 月', level:'小学', grade:5,
    courses:[
      {id:'stu-5-c1', subject:'算数', weeklyCount:2, desiredSlots:[{day:'木',slot:4},{day:'金',slot:4}]}
    ]
  },
  {
    id:'stu-6', name:'清水 悠真', level:'小学', grade:5,
    courses:[
      {id:'stu-6-c1', subject:'国語', weeklyCount:2, desiredSlots:[{day:'火',slot:5},{day:'金',slot:6}]},
      {id:'stu-6-c2', subject:'算数', weeklyCount:2, desiredSlots:[{day:'金',slot:5},{day:'月',slot:7}]}
    ]
  },
  {
    id:'stu-7', name:'斎藤 心春', level:'小学', grade:4,
    courses:[
      {id:'stu-7-c1', subject:'社会', weeklyCount:1, desiredSlots:[{day:'月',slot:5}]},
      {id:'stu-7-c2', subject:'理科', weeklyCount:1, desiredSlots:[{day:'火',slot:4}]}
    ]
  },
  {
    id:'stu-8', name:'山口 湊', level:'小学', grade:6,
    courses:[
      {id:'stu-8-c1', subject:'英語', weeklyCount:1, desiredSlots:[{day:'火',slot:5}]},
      {id:'stu-8-c2', subject:'国語', weeklyCount:2, desiredSlots:[{day:'金',slot:4},{day:'土',slot:4}]}
    ]
  },
  {
    id:'stu-9', name:'田村 陸', level:'小学', grade:4,
    courses:[
      {id:'stu-9-c1', subject:'英語', weeklyCount:1, desiredSlots:[{day:'金',slot:5}]}
    ]
  },
  {
    id:'stu-10', name:'岡本 心美', level:'小学', grade:5,
    courses:[
      {id:'stu-10-c1', subject:'算数', weeklyCount:1, desiredSlots:[{day:'火',slot:4}]}
    ]
  },
  {
    id:'stu-11', name:'上田 結菜', level:'小学', grade:6,
    courses:[
      {id:'stu-11-c1', subject:'国語', weeklyCount:1, desiredSlots:[{day:'金',slot:5}]}
    ]
  },
  {
    id:'stu-12', name:'小川 蒼', level:'小学', grade:5,
    courses:[
      {id:'stu-12-c1', subject:'英語', weeklyCount:1, desiredSlots:[{day:'金',slot:4}]}
    ]
  },
  {
    id:'stu-13', name:'西村 結衣', level:'小学', grade:5,
    courses:[
      {id:'stu-13-c1', subject:'英語', weeklyCount:2, desiredSlots:[{day:'火',slot:4},{day:'金',slot:4}]},
      {id:'stu-13-c2', subject:'国語', weeklyCount:1, desiredSlots:[{day:'水',slot:4}]}
    ]
  },
  {
    id:'stu-14', name:'石田 颯太', level:'小学', grade:6,
    courses:[
      {id:'stu-14-c1', subject:'国語', weeklyCount:1, desiredSlots:[{day:'木',slot:4}]},
      {id:'stu-14-c2', subject:'理科', weeklyCount:2, desiredSlots:[{day:'火',slot:5},{day:'土',slot:5}]}
    ]
  },
  {
    id:'stu-15', name:'橋口 美羽', level:'小学', grade:4,
    courses:[
      {id:'stu-15-c1', subject:'社会', weeklyCount:1, desiredSlots:[{day:'月',slot:5}]}
    ]
  },
  {
    id:'stu-16', name:'宮本 大地', level:'小学', grade:6,
    courses:[
      {id:'stu-16-c1', subject:'算数', weeklyCount:1, desiredSlots:[{day:'金',slot:4}]},
      {id:'stu-16-c2', subject:'国語', weeklyCount:2, desiredSlots:[{day:'水',slot:5},{day:'金',slot:7}]}
    ]
  },
  {
    id:'stu-17', name:'前川 さくら', level:'小学', grade:5,
    courses:[
      {id:'stu-17-c1', subject:'英語', weeklyCount:1, desiredSlots:[{day:'月',slot:5}]}
    ]
  },
  {
    id:'stu-18', name:'中野 翔', level:'小学', grade:5,
    courses:[
      {id:'stu-18-c1', subject:'国語', weeklyCount:1, desiredSlots:[{day:'火',slot:5}]}
    ]
  },
  {
    id:'stu-19', name:'小林 陽翔', level:'中学', grade:1,
    courses:[
      {id:'stu-19-c1', subject:'理科', weeklyCount:2, desiredSlots:[{day:'火',slot:7},{day:'木',slot:4}]}
    ]
  },
  {
    id:'stu-20', name:'加藤 結衣', level:'中学', grade:3,
    courses:[
      {id:'stu-20-c1', subject:'数学', weeklyCount:1, desiredSlots:[{day:'土',slot:4}]}
    ]
  },
  {
    id:'stu-21', name:'吉田 大輔', level:'中学', grade:2,
    courses:[
      {id:'stu-21-c1', subject:'数学', weeklyCount:2, desiredSlots:[{day:'金',slot:6},{day:'水',slot:5}]}
    ]
  },
  {
    id:'stu-22', name:'山本 さくら', level:'中学', grade:1,
    courses:[
      {id:'stu-22-c1', subject:'国語', weeklyCount:2, desiredSlots:[{day:'水',slot:6},{day:'金',slot:6}]}
    ]
  },
  {
    id:'stu-23', name:'佐々 木蒼', level:'中学', grade:1,
    courses:[
      {id:'stu-23-c1', subject:'数学', weeklyCount:1, desiredSlots:[{day:'月',slot:6}]},
      {id:'stu-23-c2', subject:'社会', weeklyCount:1, desiredSlots:[{day:'水',slot:5}]}
    ]
  },
  {
    id:'stu-24', name:'中島 芽依', level:'中学', grade:3,
    courses:[
      {id:'stu-24-c1', subject:'英語', weeklyCount:2, desiredSlots:[{day:'土',slot:4},{day:'水',slot:6}]}
    ]
  },
  {
    id:'stu-25', name:'橋本 翼', level:'中学', grade:1,
    courses:[
      {id:'stu-25-c1', subject:'社会', weeklyCount:2, desiredSlots:[{day:'土',slot:6},{day:'水',slot:6}]},
      {id:'stu-25-c2', subject:'数学', weeklyCount:1, desiredSlots:[{day:'土',slot:5}]}
    ]
  },
  {
    id:'stu-26', name:'村上 悠人', level:'中学', grade:2,
    courses:[
      {id:'stu-26-c1', subject:'数学', weeklyCount:1, desiredSlots:[{day:'木',slot:5}]}
    ]
  },
  {
    id:'stu-27', name:'松田 莉子', level:'中学', grade:1,
    courses:[
      {id:'stu-27-c1', subject:'理科', weeklyCount:1, desiredSlots:[{day:'金',slot:4}]}
    ]
  },
  {
    id:'stu-28', name:'石川 優斗', level:'高校', grade:2,
    courses:[
      {id:'stu-28-c1', subject:'数学', weeklyCount:2, desiredSlots:[{day:'月',slot:6},{day:'水',slot:5}]}
    ]
  },
  {
    id:'stu-29', name:'前田 陽子', level:'高校', grade:2,
    courses:[
      {id:'stu-29-c1', subject:'英語', weeklyCount:2, desiredSlots:[{day:'火',slot:6},{day:'木',slot:5}]},
      {id:'stu-29-c2', subject:'数学', weeklyCount:1, desiredSlots:[{day:'木',slot:6}]}
    ]
  },
  {
    id:'stu-30', name:'谷口 大翔', level:'高校', grade:1,
    courses:[
      {id:'stu-30-c1', subject:'理科', weeklyCount:1, desiredSlots:[{day:'水',slot:7}]}
    ]
  },
];

const HARDCODED_ASSIGNMENTS = [
  {id:'asg-1', studentId:'stu-3', courseId:'stu-3-c1', subject:'国語', day:'月', slot:6, teacherId:'demo-8', source:'manual'},
  {id:'asg-2', studentId:'stu-6', courseId:'stu-6-c1', subject:'国語', day:'金', slot:6, teacherId:'demo-8', source:'manual'},
  {id:'asg-3', studentId:'stu-8', courseId:'stu-8-c1', subject:'英語', day:'火', slot:5, teacherId:'demo-1', source:'manual'},
  {id:'asg-4', studentId:'stu-9', courseId:'stu-9-c1', subject:'英語', day:'金', slot:5, teacherId:'demo-1', source:'manual'},
  {id:'asg-5', studentId:'stu-11', courseId:'stu-11-c1', subject:'国語', day:'金', slot:5, teacherId:'demo-1', source:'manual'},
  {id:'asg-6', studentId:'stu-13', courseId:'stu-13-c2', subject:'国語', day:'水', slot:4, teacherId:'demo-6', source:'manual'},
  {id:'asg-7', studentId:'stu-14', courseId:'stu-14-c2', subject:'理科', day:'火', slot:5, teacherId:'demo-1', source:'manual'},
  {id:'asg-8', studentId:'stu-16', courseId:'stu-16-c2', subject:'国語', day:'水', slot:5, teacherId:'demo-3', source:'manual'},
  {id:'asg-9', studentId:'stu-16', courseId:'stu-16-c2', subject:'国語', day:'金', slot:7, teacherId:'demo-8', source:'manual'},
  {id:'asg-10', studentId:'stu-17', courseId:'stu-17-c1', subject:'英語', day:'月', slot:5, teacherId:'demo-1', source:'manual'},
  {id:'asg-11', studentId:'stu-20', courseId:'stu-20-c1', subject:'数学', day:'土', slot:4, teacherId:'demo-8', source:'manual'},
  {id:'asg-12', studentId:'stu-21', courseId:'stu-21-c1', subject:'数学', day:'水', slot:5, teacherId:'demo-2', source:'manual'},
  {id:'asg-13', studentId:'stu-22', courseId:'stu-22-c1', subject:'国語', day:'水', slot:6, teacherId:'demo-7', source:'manual'},
  {id:'asg-14', studentId:'stu-24', courseId:'stu-24-c1', subject:'英語', day:'水', slot:6, teacherId:'demo-7', source:'manual'},
  {id:'asg-15', studentId:'stu-25', courseId:'stu-25-c1', subject:'社会', day:'土', slot:6, teacherId:'demo-2', source:'manual'},
  {id:'asg-16', studentId:'stu-25', courseId:'stu-25-c2', subject:'数学', day:'土', slot:5, teacherId:'demo-8', source:'manual'},
  {id:'asg-17', studentId:'stu-26', courseId:'stu-26-c1', subject:'数学', day:'木', slot:5, teacherId:'demo-1', source:'manual'},
  {id:'asg-18', studentId:'stu-28', courseId:'stu-28-c1', subject:'数学', day:'水', slot:5, teacherId:'demo-3', source:'manual'},
  {id:'asg-19', studentId:'stu-1', courseId:'stu-1-c1', subject:'国語', day:'水', slot:6, teacherId:'demo-3', source:'manual'},
  {id:'asg-20', studentId:'stu-1', courseId:'stu-1-c1', subject:'国語', day:'木', slot:5, teacherId:'demo-1', source:'manual'},
  {id:'asg-21', studentId:'stu-1', courseId:'stu-1-c2', subject:'社会', day:'月', slot:5, teacherId:'demo-1', source:'manual'},
  {id:'asg-22', studentId:'stu-3', courseId:'stu-3-c1', subject:'国語', day:'火', slot:4, teacherId:'demo-1', source:'manual'},
  {id:'asg-23', studentId:'stu-3', courseId:'stu-3-c2', subject:'社会', day:'木', slot:4, teacherId:'demo-1', source:'manual'},
  {id:'asg-24', studentId:'stu-4', courseId:'stu-4-c1', subject:'国語', day:'火', slot:4, teacherId:'demo-1', source:'manual'},
  {id:'asg-25', studentId:'stu-5', courseId:'stu-5-c1', subject:'算数', day:'木', slot:4, teacherId:'demo-1', source:'manual'},
  {id:'asg-26', studentId:'stu-6', courseId:'stu-6-c1', subject:'国語', day:'火', slot:5, teacherId:'demo-3', source:'manual'},
  {id:'asg-27', studentId:'stu-6', courseId:'stu-6-c2', subject:'算数', day:'金', slot:5, teacherId:'demo-5', source:'manual'},
  {id:'asg-28', studentId:'stu-7', courseId:'stu-7-c1', subject:'社会', day:'月', slot:5, teacherId:'demo-5', source:'manual'},
  {id:'asg-29', studentId:'stu-7', courseId:'stu-7-c2', subject:'理科', day:'火', slot:4, teacherId:'demo-6', source:'manual'},
  {id:'asg-30', studentId:'stu-8', courseId:'stu-8-c2', subject:'国語', day:'金', slot:4, teacherId:'demo-1', source:'manual'},
  {id:'asg-31', studentId:'stu-10', courseId:'stu-10-c1', subject:'算数', day:'火', slot:4, teacherId:'demo-6', source:'manual'},
  {id:'asg-32', studentId:'stu-12', courseId:'stu-12-c1', subject:'英語', day:'金', slot:4, teacherId:'demo-1', source:'manual'},
  {id:'asg-33', studentId:'stu-13', courseId:'stu-13-c1', subject:'英語', day:'金', slot:4, teacherId:'demo-6', source:'manual'},
  {id:'asg-34', studentId:'stu-14', courseId:'stu-14-c1', subject:'国語', day:'木', slot:4, teacherId:'demo-6', source:'manual'},
  {id:'asg-35', studentId:'stu-14', courseId:'stu-14-c2', subject:'理科', day:'土', slot:5, teacherId:'demo-5', source:'manual'},
  {id:'asg-36', studentId:'stu-15', courseId:'stu-15-c1', subject:'社会', day:'月', slot:5, teacherId:'demo-5', source:'manual'},
  {id:'asg-37', studentId:'stu-18', courseId:'stu-18-c1', subject:'国語', day:'火', slot:5, teacherId:'demo-3', source:'manual'},
  {id:'asg-38', studentId:'stu-21', courseId:'stu-21-c1', subject:'数学', day:'金', slot:6, teacherId:'demo-8', source:'manual'},
  {id:'asg-39', studentId:'stu-23', courseId:'stu-23-c1', subject:'数学', day:'月', slot:6, teacherId:'demo-8', source:'manual'},
  {id:'asg-40', studentId:'stu-25', courseId:'stu-25-c1', subject:'社会', day:'水', slot:6, teacherId:'demo-5', source:'manual'},
  {id:'asg-41', studentId:'stu-27', courseId:'stu-27-c1', subject:'理科', day:'金', slot:4, teacherId:'demo-5', source:'manual'},
  {id:'asg-42', studentId:'stu-28', courseId:'stu-28-c1', subject:'数学', day:'月', slot:6, teacherId:'demo-4', source:'manual'},
  {id:'asg-43', studentId:'stu-29', courseId:'stu-29-c1', subject:'英語', day:'木', slot:5, teacherId:'demo-3', source:'manual'},
  {id:'asg-44', studentId:'stu-29', courseId:'stu-29-c2', subject:'数学', day:'木', slot:6, teacherId:'demo-3', source:'manual'},
  {id:'asg-45', studentId:'stu-2', courseId:'stu-2-c1', subject:'算数', day:'月', slot:4, teacherId:'demo-1', source:'manual'},
  {id:'asg-46', studentId:'stu-5', courseId:'stu-5-c1', subject:'算数', day:'金', slot:4, teacherId:'demo-5', source:'manual'},
  {id:'asg-47', studentId:'stu-8', courseId:'stu-8-c2', subject:'国語', day:'土', slot:4, teacherId:'demo-8', source:'manual'},
  {id:'asg-48', studentId:'stu-16', courseId:'stu-16-c1', subject:'算数', day:'金', slot:4, teacherId:'demo-6', source:'manual'},
  {id:'asg-49', studentId:'stu-23', courseId:'stu-23-c2', subject:'社会', day:'水', slot:5, teacherId:'demo-2', source:'manual'},
  {id:'asg-50', studentId:'stu-29', courseId:'stu-29-c1', subject:'英語', day:'火', slot:6, teacherId:'demo-3', source:'manual'},
];
