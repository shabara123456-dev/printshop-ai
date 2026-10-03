import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'apps/web',
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  build: {
    outDir: '../../dist/web',
    emptyOutDir: true,
    rollupOptions: { output: { manualChunks: { react: ['react', 'react-dom'], supabase: ['@supabase/supabase-js'] } } }
  }
});
