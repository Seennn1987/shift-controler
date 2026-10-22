// 閉じたコピーだけに書く。本番のアドレスへは接続しない。
import http from 'http';

const EMULATOR_HOST = '127.0.0.1:8180';
const PROJECT = 'shift-controller-4ecaf';
const STATE_ID = 'safety-draft-state';
const WEEKDAYS = ['月', '火', '水', '木', '金', '土', '日'];

if(process.env.FIRESTORE_EMULATOR_HOST !== EMULATOR_HOST){
  console.error('閉じたコピー以外では動かしません。本番へは書きません。');
  process.exit(1);
}

function request(method, path, body){
  if(!path.startsWith('/v1/projects/' + PROJECT + '/databases/%28default%29/documents')){
    throw new Error('想定外の宛先です');
  }
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: 8180,
      path,
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
    }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, raw: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    if(body) req.write(body);
    req.end();
  });
}

function str(value){
  return { stringValue: value };
}

function draftFields(entry){
  return {
    id: str(entry.id),
    day: str(entry.day),
    subject: str(entry.subject),
    adminUid: str('closed-draft-test'),
    studentId: str('s-safety'),
    teacherId: str('t-safety'),
    source: str('manual'),
  };
}

function lessonValue(entry){
  return { mapValue: { fields: {
    id: str(entry.id),
    day: str(entry.day),
    subject: str(entry.subject),
  } } };
}

const base = `/v1/projects/${PROJECT}/databases/%28default%29/documents`;

function docPath(collection, id){
  return base + '/' + collection + '/' + encodeURIComponent(id);
}

function assert(condition, message){
  if(!condition) throw new Error(message);
}

const beforeList = await request('GET', base + '/appState?pageSize=20');
assert(beforeList.status === 200, '閉じたコピーの授業一覧を読めません');
const beforeTimes = new Map();
for(const item of (JSON.parse(beforeList.raw).documents || [])){
  const name = item.name || '';
  if(name.endsWith('/' + STATE_ID)) continue;
  beforeTimes.set(name, item.updateTime || '');
}

const pending = { id: 'pending-safety-1', day: '木', subject: '国語' };
const legacy = { id: 'legacy-safety-1', day: '火', subject: '社会' };
const stateBody = JSON.stringify({
  fields: {
    pendingAssignments: { arrayValue: { values: [lessonValue(pending)] } },
    draftAssignments: { arrayValue: { values: [lessonValue(legacy)] } },
    rev: { integerValue: '1' },
  },
});
const created = await request('PATCH', base + '/appState/' + STATE_ID, stateBody);
assert(created.status === 200, '試し用の授業一覧を用意できません');

const drafts = WEEKDAYS.map(day => ({ id: 'safety-draft-' + day, day, subject: day === '木' ? '国語' : '社会' }));
for(const entry of drafts){
  const written = await request('PATCH', docPath('lessonDrafts', entry.id), JSON.stringify({ fields: draftFields(entry) }));
  assert(written.status === 200, '仮決めを書けません');
}

const touched = await request(
  'PATCH',
  base + '/appState/' + STATE_ID + '?updateMask.fieldPaths=rev',
  JSON.stringify({ fields: { rev: { integerValue: '2' } } }),
);
assert(touched.status === 200, '授業一覧の保存回数だけを更新できません');

const readMask = await request('GET', base + '/appState/' + STATE_ID);
assert(readMask.status === 200, '試し用の授業一覧を読み直せません');
assert(!readMask.raw.includes('\uFFFD'), '曜日が壊れています');
assert(readMask.raw.includes('木'), '木曜日が消えました');
assert(readMask.raw.includes('火'), '火曜日が消えました');
assert(readMask.raw.includes('pending-safety-1'), '承認待ちが消えました');
assert(readMask.raw.includes('legacy-safety-1'), '仮決め欄が、関係ない保存で消えました');

for(const entry of drafts){
  const doc = await request('GET', docPath('lessonDrafts', entry.id));
  assert(doc.status === 200, '仮決めの置き場が消えました');
  assert(doc.raw.includes(entry.day), entry.day + ' を読み戻せません');
  assert(!doc.raw.includes('\uFFFD'), '仮決めの曜日が壊れています');
}

const cleared = await request(
  'PATCH',
  base + '/appState/' + STATE_ID + '?updateMask.fieldPaths=draftAssignments&updateMask.fieldPaths=rev',
  JSON.stringify({ fields: {
    draftAssignments: { arrayValue: { values: [] } },
    rev: { integerValue: '3' },
  } }),
);
assert(cleared.status === 200, '仮決め欄だけを空にできません');
const afterClear = await request('GET', base + '/appState/' + STATE_ID);
assert(afterClear.raw.includes('pending-safety-1'), '仮決め欄を空にしたとき承認待ちが消えました');
assert(!afterClear.raw.includes('legacy-safety-1'), '仮決め欄が空になっていません');
for(const entry of drafts){
  const doc = await request('GET', docPath('lessonDrafts', entry.id));
  assert(doc.status === 200 && doc.raw.includes(entry.day), '仮決め欄を空にしたとき、別の置き場の仮決めが消えました');
}

const removed = await request('DELETE', docPath('lessonDrafts', 'safety-draft-月'));
assert(removed.status === 200, '1件の解除ができません');
const kept = await request('GET', docPath('lessonDrafts', 'safety-draft-木'));
assert(kept.status === 200 && kept.raw.includes('木'), '1件の解除で木曜日の仮決めが消えました');
const gone = await request('GET', docPath('lessonDrafts', 'safety-draft-月'));
assert(gone.status === 404, '解除した仮決めが残っています');

await request('DELETE', base + '/appState/' + STATE_ID);
for(const entry of drafts){
  await request('DELETE', docPath('lessonDrafts', entry.id));
}

const afterList = await request('GET', base + '/appState?pageSize=20');
const afterTimes = new Map();
for(const item of (JSON.parse(afterList.raw).documents || [])){
  const name = item.name || '';
  if(name.endsWith('/' + STATE_ID)) throw new Error('試し用の授業一覧を片付けられません');
  afterTimes.set(name, item.updateTime || '');
}
for(const [name, time] of beforeTimes){
  assert(afterTimes.get(name) === time, 'もとからある授業一覧を更新してしまいました');
}

console.log('lesson_draft_closed_ok');
