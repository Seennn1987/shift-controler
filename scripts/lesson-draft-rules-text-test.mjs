import fs from 'fs';

const rules = fs.readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
const start = rules.indexOf('match /lessonDrafts/');
if(start < 0) throw new Error('仮決めの許可がありません');
const block = rules.slice(start, rules.indexOf('match /', start + 10) === -1 ? undefined : rules.indexOf('match /', start + 10));
if(!block.includes('resource == null')){
  throw new Error('まだ無い仮決めの確認が拒否される許可です');
}
console.log('lesson_draft_rules_text_ok');
