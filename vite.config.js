import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig(({ command }) => ({
  // GitHub Pages 公開時は /shift-controler/ 。ローカル開発時は /
  base: command === 'serve' ? '/' : '/shift-controler/',
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        teacher: resolve(__dirname, 'teacher.html'),
      },
    },
  },
}));
