import { defineConfig } from 'vite';

export default defineConfig({
  // Use relative base paths so the site renders correctly under GitHub Pages subdirectories
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true
  }
});
