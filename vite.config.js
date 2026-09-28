import { defineConfig } from 'vite';

// GitHub Pages serves this repo at https://<user>.github.io/dream-binder/
export default defineConfig({
  base: process.env.NODE_ENV === 'production' ? '/dream-binder/' : '/',
});
