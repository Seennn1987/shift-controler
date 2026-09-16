/**
 * 教室長画面（localhost）のコンソール用。
 *
 * 使い方:
 * 1. http://127.0.0.1:5173/ を開く
 * 2. 教室長でログイン
 * 3. このファイルの中身をすべてコピーしてコンソールに貼り付けて Enter
 *    または、すでに読み込まれていれば __pitakomaReadSafetySelfTest() だけ実行
 *
 * 実生徒・実割当は変更しません。試し用の承認チケットだけ作り、最後に消します。
 */
(async function pitakomaReadSafetySelfTestSnippet(){
  if(typeof window.__pitakomaReadSafetySelfTest === 'function'){
    return window.__pitakomaReadSafetySelfTest();
  }
  console.error('自己検証が読み込まれていません。http://127.0.0.1:5173/ で教室長ログイン後、ページを再読み込みしてからもう一度実行してください。');
  return { allOk: false, failed: 1 };
})();
