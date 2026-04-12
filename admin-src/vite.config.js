import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',                     // ← relative paths (critical)
  build: {
    outDir: '../public/admin',
    emptyOutDir: true,
  },
})