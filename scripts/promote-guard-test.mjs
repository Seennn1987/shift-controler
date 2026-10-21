import { legacyPromoteOutcome, promoteOutcome } from '../src/shared/promote-guard.mjs';

function assert(cond, msg){
  if(!cond){
    console.error('NG', msg);
    process.exit(1);
  }
}

const scienceOnly = [{ subject: '社会' }];
const both = [{ subject: '理科' }, { subject: '社会' }];
const kokugoShakai = [{ subject: '国語' }, { subject: '社会' }];
const dual = { subjects: ['理科', '社会'], subject: '理科・社会' };
const other = { subjects: ['国語', '社会'], subject: '国語・社会' };

assert(legacyPromoteOutcome(scienceOnly).promoted, '修正前は社会だけでも確定');
assert(!promoteOutcome(dual, scienceOnly, true).promoted, '理科社会は片方では確定しない');
assert(promoteOutcome(dual, both, true).promoted, '理科社会は両方と保存成功で確定');
assert(!promoteOutcome(dual, both, false).promoted, '保存失敗では確定しない');
assert(promoteOutcome(other, kokugoShakai, true).promoted, '国語社会も両方で確定');
assert(!promoteOutcome(other, [{ subject: '国語' }], true).promoted, '国語社会は片方では確定しない');
assert(promoteOutcome({ subject: '国語' }, [{ subject: '国語' }], true).promoted, '国語1教科は保存成功で確定');
assert(!promoteOutcome({ subject: '国語' }, [{ subject: '国語' }], false).promoted, '国語1教科は保存失敗では確定しない');
assert(promoteOutcome({ subject: 'プログラミング' }, [{ subject: 'プログラミング' }], true).listed, 'プログラミングは1教科のまま確定できる');
assert(promoteOutcome({ subject: 'プログラミング' }, [{ subject: 'プログラミング' }, { subject: '理科' }], true).listed, 'プログラミングの確定は2教科に分けない');
console.log('promote_guard_ok');
