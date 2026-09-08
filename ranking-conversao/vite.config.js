import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/ranking-conversao/',
  plugins: [tailwindcss(), react()],
  build: {
    target: 'es2022',
    sourcemap: false,
    outDir: 'dist',
    assetsDir: 'assets',
  },
});
