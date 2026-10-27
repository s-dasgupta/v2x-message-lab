/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The app uses hash-based routing, so relative asset paths ('./') work from any
// GitHub Pages project URL (https://USERNAME.github.io/v2x-message-lab/) without
// server-side rewrites. Set BASE_PATH (e.g. '/v2x-message-lab/') to force an
// absolute base if you prefer.
const base = process.env.BASE_PATH ?? './';

export default defineConfig({
  base,
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'es2020',
  },
  test: {
    environment: 'node',
    // UI tests opt into jsdom with a `// @vitest-environment jsdom` docblock.
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      include: ['src/asn1/**', 'src/j2735/**', 'src/analysis/**'],
      reporter: ['text', 'html'],
    },
  },
});
