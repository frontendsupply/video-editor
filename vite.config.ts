import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // The software decoder starts its own worker from a path next to itself, which pre-bundling would break.
  optimizeDeps: { exclude: ['@ffmpeg/ffmpeg'] },
})
