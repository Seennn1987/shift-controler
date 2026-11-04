import {
  countChangeBlock,
  formatCountLine,
  liveExtraHolds,
  summarizeBooking,
} from '../src/admin/extra-lesson-count.mjs';

const today = '2026-12-20';
const booking = {
  id: 'b1',
  lines: [
    { id: 'math', subject: '算数', count: 4 },
    { id: 'jp', subject: '国語', count: 4 },
  ],
};
const assignments = [1, 2, 3].map(n => ({
  id: `a${n}`,
  extraLineId: 'math',
  extraBookingId: 'b1',
  oneTimeDate: `2026-12-2${n}`,
  slot: 5,
  half: 'full',
  bucket: 'pending',
  teacherId: 't1',
  studentId: 's1',
  courseId: 'c1',
}));
const summary = summarizeBooking(booking, { today, holds: [], assignments, absences: [] });
const text = formatCountLine(summary);

if(summary.requested !== 8) fail('合計8');
if(summary.unplaced !== 5) fail('未配置5');
if(summary.placed !== 3) fail('配置済み3');
if(summary.done !== 0) fail('実施済み0');
if(!text.includes('承認待ち 3')) fail('承認待ちは配置済みの内訳');
if(text.includes('実施済み 3')) fail('承認待ちを実施済みに入れない');

const done = summarizeBooking(booking, {
  today,
  holds: [],
  assignments: [{
    id: 'done1',
    extraLineId: 'math',
    oneTimeDate: '2026-12-01',
    slot: 4,
    bucket: 'confirmed',
    teacherId: 't1',
  }],
  absences: [],
});
if(done.done !== 1) fail('過去の確定は実施済み');
if(countChangeBlock(done.lines[0].summary, 0)){
  // math line has 1 done
}else fail('実施済みを下回る変更は止める');
if(countChangeBlock(summary.lines[0].summary, 4) !== '') fail('未配置の範囲なら増やせる');
if(!countChangeBlock(summary.lines[0].summary, 2)) fail('配置済みより少ない変更は止める');

const holds = [{ id: 'h1', extraLineId: 'math', date: '2026-12-24', slot: 5, half: 'full', studentId: 's1' }];
const absent = [{ extraLineId: 'math', date: '2026-12-24', slot: 5, half: 'full', status: 'pending' }];
const seated = liveExtraHolds(holds, absent, '2026-12-24', 5, null);
if(seated.length !== 0) fail('欠席の日は席を空ける');
const waiting = summarizeBooking(booking, { today, holds, assignments: [], absences: absent });
if(waiting.placed !== 1 || waiting.unplaced !== 7) fail('振替待ちは配置済み');

console.log('extra-lesson-count ok');
console.log(text);

function fail(message){
  console.error('NG ' + message);
  process.exit(1);
}
