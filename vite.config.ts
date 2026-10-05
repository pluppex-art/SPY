import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import {defineConfig, loadEnv, type Plugin} from 'vite';

// Marca de versão do build, pra detectar aba aberta rodando bundle antigo
// (ver useBuildVersionCheck.ts) — usa o commit da Vercel quando existe
// (deploy real) e cai pro timestamp em build local/dev.
function buildIdPlugin(buildId: string): Plugin {
  return {
    name: 'emit-build-id',
    writeBundle() {
      fs.writeFileSync(path.resolve(__dirname, 'dist/build-id.txt'), buildId);
    },
  };
}

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  const buildId = process.env.VERCEL_GIT_COMMIT_SHA || String(Date.now());
  return {
    plugins: [react(), tailwindcss(), buildIdPlugin(buildId)],
    define: {
      __BUILD_ID__: JSON.stringify(buildId),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: false,
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    build: {
      outDir: 'dist',
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom', 'react-router-dom'],
            supabase: ['@supabase/supabase-js'],
          },
        },
      },
    },
  };
});
