import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  server: { port: 5273, strictPort: false },
  preview: { port: 5274 },
  build: { target: 'es2022', outDir: 'dist', assetsInlineLimit: 0 },
})
