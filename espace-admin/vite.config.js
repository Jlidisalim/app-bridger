import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  // Only scan the real entry point — prevents Vite from picking up
  // the static design HTML prototypes in design/**/*.html
  optimizeDeps: {
    entries: ['index.html'],
  },
})
