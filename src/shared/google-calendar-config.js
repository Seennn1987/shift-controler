/** GoogleカレンダーAPI用。OAuthクライアントIDは公開してよい値（秘密鍵ではない）。 */
export const GOOGLE_CALENDAR_CLIENT_ID = '';

export const GOOGLE_CALENDAR_NAME = 'ピタコマ';

export const GOOGLE_CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar';

/** クライアント作成時に許可する画面アドレス */
export const GOOGLE_CALENDAR_JS_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'https://shift-controller-4ecaf.web.app',
  'https://shift-controller-4ecaf.firebaseapp.com',
];
