// 本番の授業一覧へ、消えていた6件だけ足す。社会の記録は作り直さない。
import fs from 'fs';
import https from 'https';

const PROJECT = 'shift-controller-4ecaf';
if(process.env.FIRESTORE_EMULATOR_HOST){
  console.error('エミュレータ向けの環境変数が残っています。本番へは書きません。');
  process.exit(1);
}
if(process.env.PITAKOMA_RESTORE !== 'production'){
  console.error('本番へ戻す確認がありません。');
  process.exit(1);
}

const cred = JSON.parse(fs.readFileSync('/Users/shoui/.config/firebase/mirailab_admin_gmail.com_application_default_credentials.json','utf8'));

function request(options, body){
  return new Promise((resolve, reject) => {
    const req = https.request(options, res => {
      let raw = '';
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, raw }));
    });
    req.on('error', reject);
    if(body) req.write(body);
    req.end();
  });
}

async function accessToken(){
  const body = new URLSearchParams({
    client_id: cred.client_id,
    client_secret: cred.client_secret,
    refresh_token: cred.refresh_token,
    grant_type: 'refresh_token',
  }).toString();
  const res = await request({
    hostname: 'oauth2.googleapis.com',
    path: '/token',
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) },
  }, body);
  if(res.status !== 200) throw new Error('token failed');
  return JSON.parse(res.raw).access_token;
}

async function api(token, method, path, payload){
  const body = payload ? JSON.stringify(payload) : null;
  const res = await request({
    hostname: 'firestore.googleapis.com',
    path,
    method,
    headers: {
      Authorization: 'Bearer ' + token,
      ...(body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } : {}),
    },
  }, body);
  if(res.status !== 200) throw new Error(method + ' ' + res.status + ' ' + res.raw.slice(0, 400));
  return JSON.parse(res.raw);
}

function str(field){
  return field?.stringValue || '';
}

function lessonOf(value){
  const fields = value.mapValue.fields;
  return {
    id: str(fields.id),
    subject: str(fields.subject),
    studentId: str(fields.studentId),
    courseId: str(fields.courseId),
    teacherId: str(fields.teacherId),
    oneTimeDate: str(fields.oneTimeDate),
    day: str(fields.day),
    slot: fields.slot?.integerValue || '',
    dualGroupId: str(fields.dualGroupId),
  };
}

function cloneLesson(value, overrides){
  const fields = { ...value.mapValue.fields };
  Object.entries(overrides).forEach(([key, val]) => {
    if(val == null){
      delete fields[key];
      return;
    }
    if(typeof val === 'number') fields[key] = { integerValue: String(val) };
    else fields[key] = { stringValue: val };
  });
  return { mapValue: { fields } };
}

const EXPECTED_SOCIAL = [
  { date: '2026-10-01', id: 'asg-1790322949268-r4cz', dual: 'dual-1789387218183-pkw9' },
  { date: '2026-10-08', id: 'asg-1790323490004-o14j', dual: 'dual-1789387218183-pkw9' },
  { date: '2026-10-15', id: 'asg-1791171456908-viu7', dual: 'dual-1790579124410-p9yr' },
  { date: '2026-10-22', id: 'asg-1791002439723-u61y', dual: 'dual-1790579124410-p9yr' },
];

const token = await accessToken();
const listed = await api(token, 'GET', `/v1/projects/${PROJECT}/databases/(default)/documents/appState?pageSize=5`);
const main = (listed.documents || []).find(doc => doc.fields?.rev && doc.fields?.assignments);
if(!main) throw new Error('本番の授業一覧が見つかりません');
const adminUid = main.name.split('/').pop();
const students = (main.fields.students.arrayValue.values || []).map(value => lessonOf({ mapValue: { fields: {
  ...value.mapValue.fields,
  subject: value.mapValue.fields.name,
} } }));
const teachers = (main.fields.teachers.arrayValue.values || []).map(value => ({
  id: str(value.mapValue.fields.id),
  name: str(value.mapValue.fields.name),
}));
function person(list, part){
  return list.find(item => (item.name || '').replace(/\s/g, '').includes(part));
}
const nagayama = (main.fields.students.arrayValue.values || []).find(value => str(value.mapValue.fields.name).includes('長山'));
const shino = (main.fields.students.arrayValue.values || []).find(value => str(value.mapValue.fields.name).includes('篠原'));
const nagaId = str(nagayama.mapValue.fields.id);
const shinoId = str(shino.mapValue.fields.id);
const courses = (student) => (student.mapValue.fields.courses?.arrayValue?.values || []).map(value => ({
  id: str(value.mapValue.fields.id),
  subject: str(value.mapValue.fields.subject),
}));
const science = courses(nagayama).find(course => course.subject === '理科');
const japanese = courses(shino).find(course => course.subject === '国語');
const ouchi = teachers.find(teacher => teacher.name.replace(/\s/g, '').includes('大内悠生'));
const values = main.fields.assignments.arrayValue.values || [];
const lessons = values.map(lessonOf);
const socials = EXPECTED_SOCIAL.map(expected => {
  const row = lessons.find(lesson => lesson.id === expected.id);
  if(!row || row.oneTimeDate !== expected.date || row.dualGroupId !== expected.dual || row.subject !== '社会' || row.studentId !== nagaId){
    throw new Error('社会の記録が想定と違います ' + expected.date);
  }
  return { expected, row, value: values.find(value => str(value.mapValue.fields.id) === expected.id) };
});
const already = lessons.filter(lesson =>
  (lesson.studentId === nagaId && lesson.subject === '理科' && EXPECTED_SOCIAL.some(item => item.date === lesson.oneTimeDate)) ||
  (lesson.studentId === shinoId && lesson.subject === '国語' && (lesson.oneTimeDate === '2026-10-21' || lesson.oneTimeDate === '2026-10-28'))
);
if(already.length) throw new Error('戻す授業がすでにあります');
const programmingBefore = lessons.filter(lesson => lesson.subject === 'プログラミング').length;

const added = socials.map(({ row, value, expected }) => cloneLesson(value, {
  id: 'asg-restore-' + expected.date + '-sci',
  subject: '理科',
  courseId: science.id,
}));
['2026-10-21', '2026-10-28'].forEach(date => {
  const weekday = ['日', '月', '火', '水', '木', '金', '土'][new Date(date + 'T00:00:00').getDay()];
  added.push(cloneLesson(socials[0].value, {
    id: 'asg-restore-' + date + '-jp',
    subject: '国語',
    courseId: japanese.id,
    studentId: shinoId,
    teacherId: ouchi.id,
    oneTimeDate: date,
    day: weekday,
    slot: 5,
    dualGroupId: null,
    source: 'manual',
  }));
});

const teacherName = id => teachers.find(teacher => teacher.id === id)?.name || id;
const preview = added.map(value => {
  const lesson = lessonOf(value);
  return `${lesson.oneTimeDate} ${lesson.subject} ${teacherName(lesson.teacherId)} ${lesson.dualGroupId || 'セットなし'}`;
});
console.log(preview.join('\n'));

const nextRev = Number(main.fields.rev.integerValue) + 1;
const nextValues = values.concat(added);
const commit = await api(token, 'POST', `/v1/projects/${PROJECT}/databases/(default)/documents:commit`, {
  writes: [{
    update: {
      name: main.name,
      fields: {
        assignments: { arrayValue: { values: nextValues } },
        rev: { integerValue: String(nextRev) },
        updatedAt: { timestampValue: new Date().toISOString() },
      },
    },
    updateMask: { fieldPaths: ['assignments', 'rev', 'updatedAt'] },
    currentDocument: { updateTime: main.updateTime },
  }],
});

const reread = await api(token, 'GET', `/v1/projects/${PROJECT}/databases/(default)/documents/appState/${adminUid}`);
const after = (reread.fields.assignments.arrayValue.values || []).map(lessonOf);
const afterIds = new Set(after.map(lesson => lesson.id));
socials.forEach(({ row }) => {
  const found = after.find(lesson => lesson.id === row.id);
  if(!found || found.teacherId !== row.teacherId || found.dualGroupId !== row.dualGroupId || found.subject !== '社会'){
    throw new Error('書き込み後に社会の記録が変わりました');
  }
});
added.forEach(value => {
  if(!afterIds.has(lessonOf(value).id)) throw new Error('足した授業が見つかりません');
});
if(after.length !== lessons.length + 6) throw new Error('件数が6件増えていません');
if(after.filter(lesson => lesson.subject === 'プログラミング').length !== programmingBefore){
  throw new Error('プログラミングの件数が変わりました');
}
if(Number(reread.fields.rev.integerValue) !== nextRev) throw new Error('保存回数が想定と違います');
console.log('restore_ok', after.length, 'rev', nextRev, 'commit', commit.writeResults?.length || 0);
