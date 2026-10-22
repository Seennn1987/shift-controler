import { diffDrafts, listsAfterDraftSave, mergeDraftsForRead, unionDrafts } from '../src/shared/lesson-draft-diff.mjs';

const days = ['月', '火', '水', '木', '金', '土', '日'];
const remote = days.map(day => ({ id: 'draft-' + day, day, subject: '国語' }));
const legacy = [{ id: 'draft-木', day: '木', subject: '国語' }, { id: 'draft-old', day: '火', subject: '社会' }];
const union = unionDrafts(remote, legacy);
if(union.list.length !== 8) throw new Error('既存の仮決めが消えました');
if(union.missing.length !== 1 || union.missing[0].id !== 'draft-old') throw new Error('未移動の仮決めを拾えていません');
if(union.list.some(entry => String(entry.day).includes('\uFFFD'))) throw new Error('曜日が壊れました');
if(!union.list.some(entry => entry.day === '木')) throw new Error('木曜日が消えました');

const stale = [{ id: 'draft-月', day: '月' }];
const kept = unionDrafts(remote, stale);
if(kept.list.length !== remote.length) throw new Error('古い画面の短い一覧が、別の置き場の仮決めを消しました');

const pending = [{ id: 'draft-月', day: '月' }];
const visible = mergeDraftsForRead(remote, legacy, [], pending);
if(visible.some(entry => entry.id === 'draft-月')) throw new Error('承認待ちを仮決めとして出しました');
if(!visible.some(entry => entry.id === 'draft-old')) throw new Error('承認待ちでない仮決めまで隠れました');
if(pending.length !== 1) throw new Error('承認待ちを消しました');

const before = [{ id: 'a', day: '木', subject: '国語' }];
const after = [{ id: 'a', day: '木', subject: '国語' }, { id: 'b', day: '金', subject: '社会' }];
if(listsAfterDraftSave(before, after, false).some(entry => entry.id === 'b')) throw new Error('失敗した保存を画面に出しました');
if(!listsAfterDraftSave(before, after, true).some(entry => entry.id === 'b')) throw new Error('成功した保存が画面に出ません');
const both = diffDrafts(before, [
  { id: 'dual-a', day: '木', subject: '国語' },
  { id: 'dual-b', day: '木', subject: '社会' },
]);
if(both.upserts.length !== 2 || both.deleteIds.length !== 1) throw new Error('2教科をまとめて扱えません');

console.log('lesson_draft_diff_ok');
