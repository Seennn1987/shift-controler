// 本番は読むだけ。書き込み先は 127.0.0.1:8180 の閉じたコピーだけ。
import fs from 'fs';
import https from 'https';
import http from 'http';

const EMULATOR_HOST = '127.0.0.1:8180';
const PROJECT = 'shift-controller-4ecaf';
const OUT_DIR = '/tmp/pitakoma-closed';

if(process.env.FIRESTORE_EMULATOR_HOST !== EMULATOR_HOST){
  console.error('FIRESTORE_EMULATOR_HOST が 127.0.0.1:8180 ではありません。本番へは書きません。');
  process.exit(1);
}

const cred = JSON.parse(fs.readFileSync('/Users/shoui/.config/firebase/mirailab_admin_gmail.com_application_default_credentials.json','utf8'));

function request(transport, options, body){
  return new Promise((resolve, reject) => {
    const req = transport.request(options, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, raw: Buffer.concat(chunks).toString('utf8') }));
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
  const res = await request(https, {
    hostname: 'oauth2.googleapis.com',
    path: '/token',
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) },
  }, body);
  if(res.status !== 200) throw new Error('token failed');
  return JSON.parse(res.raw).access_token;
}

async function productionGet(token, path){
  const res = await request(https, {
    hostname: 'firestore.googleapis.com',
    path,
    method: 'GET',
    headers: { Authorization: 'Bearer ' + token },
  });
  if(res.status !== 200) throw new Error('read ' + res.status + ' ' + res.raw.slice(0, 200));
  return JSON.parse(res.raw);
}

async function productionPost(token, path, payload){
  const body = JSON.stringify(payload);
  const res = await request(https, {
    hostname: 'firestore.googleapis.com',
    path,
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    },
  }, body);
  if(res.status !== 200) throw new Error('query ' + res.status + ' ' + res.raw.slice(0, 200));
  return JSON.parse(res.raw);
}

function emulatorRequest(method, path, payload){
  const body = payload ? JSON.stringify(payload) : null;
  return request(http, {
    hostname: '127.0.0.1',
    port: 8180,
    path,
    method,
    headers: body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } : {},
  }, body);
}

async function queryAll(token, collectionId, adminUid){
  const rows = [];
  let startAfter = null;
  for(;;){
    const structuredQuery = {
      from: [{ collectionId }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'adminUid' },
          op: 'EQUAL',
          value: { stringValue: adminUid },
        },
      },
      orderBy: [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }],
      limit: 200,
    };
    if(startAfter){
      structuredQuery.startAt = { values: [{ referenceValue: startAfter }], before: false };
    }
    const result = await productionPost(token, `/v1/projects/${PROJECT}/databases/(default)/documents:runQuery`, { structuredQuery });
    const page = result.filter(row => row.document).map(row => row.document);
    const docs = page.filter(doc => doc.name !== startAfter);
    if(docs.length === 0) break;
    rows.push(...docs);
    if(page.length < 200) break;
    startAfter = page[page.length - 1].name;
  }
  return rows;
}

const token = await accessToken();
const listed = await productionGet(token, `/v1/projects/${PROJECT}/databases/(default)/documents/appState?pageSize=5`);
const main = (listed.documents || []).find(doc => doc.fields && doc.fields.rev && doc.fields.assignments);
if(!main) throw new Error('本番の授業一覧が見つかりません');
const adminUid = main.name.split('/').pop();
const approvals = await queryAll(token, 'assignmentApprovals', adminUid);
const schedules = await queryAll(token, 'teacherSchedules', adminUid);

async function writeDoc(document){
  const relative = document.name.split('/documents/')[1];
  const res = await emulatorRequest('PATCH', `/v1/projects/${PROJECT}/databases/(default)/documents/${relative}`, { fields: document.fields });
  if(res.status !== 200) throw new Error('emulator write ' + res.status + ' ' + res.raw.slice(0, 300));
}

await writeDoc(main);
for(const doc of approvals) await writeDoc(doc);
for(const doc of schedules) await writeDoc(doc);

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(`${OUT_DIR}/meta.json`, JSON.stringify({
  adminUid,
  approvalCount: approvals.length,
  scheduleCount: schedules.length,
  updateTime: main.updateTime,
}, null, 2));
console.log('closed_copy_ok', adminUid.slice(0, 6), 'approvals', approvals.length, 'schedules', schedules.length);
