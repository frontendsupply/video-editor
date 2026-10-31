import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': decodeURIComponent(new URL('./src', import.meta.url).pathname) } }, // @/… is src/…
  // The software decoder starts its own worker from a path next to itself, which pre-bundling would break.
  optimizeDeps: { exclude: ['@ffmpeg/ffmpeg'] },
})
