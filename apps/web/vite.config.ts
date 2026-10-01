import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const fromHere = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@foci/shared': fromHere('../../packages/shared/src/index.ts') },
  },
  define: {
    __APP_VERSION__: JSON.stringify(process.env.APP_VERSION ?? 'dev'),
    __GIT_SHA__: JSON.stringify(process.env.GIT_SHA ?? 'local'),
    __BUILD_DATE__: JSON.stringify(process.env.BUILD_DATE ?? 'unknown'),
  },
});
