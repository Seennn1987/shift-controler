import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const appStateModule = path.resolve(here, '../src/admin/state.js');
const serverStateModule = path.resolve(here, 'src/server-state.js');

// アプリ本体の計算（src/admin/*.js）をそのまま使うため、ブラウザ用の Firebase を起動する state.js だけをサーバー用に差し替える
const swapAppState = {
  name: 'swap-app-state',
  setup(b){
    b.onResolve({ filter: /state\.js$/ }, args=>{
      const resolved = path.resolve(args.resolveDir, args.path);
      if(resolved === appStateModule) return { path: serverStateModule };
      return null;
    });
  },
};

await build({
  entryPoints: [path.resolve(here, 'src/index.js')],
  outfile: path.resolve(here, 'lib/index.js'),
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['firebase-admin', 'firebase-functions', 'firebase-admin/*', 'firebase-functions/*'],
  banner: { js: "process.env.TZ = 'Asia/Tokyo';" },
  plugins: [swapAppState],
  loader: { '.jpg': 'empty', '.png': 'empty', '.svg': 'empty' },
  logLevel: 'info',
});
