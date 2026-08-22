import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig(() => ({
  // Firebase Hosting（ドメイン直下）向け。ローカル開発も同じ /
  base: '/',
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        teacher: resolve(__dirname, 'teacher.html'),
      },
    },
  },
}));
