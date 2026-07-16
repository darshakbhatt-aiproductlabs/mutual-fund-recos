import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Base path: GitHub Pages serves this project from /mutual-fund-recos/,
// Vercel serves it from /. Set via env so both deploy targets work
// without editing this file.
export default defineConfig({
  plugins: [react()],
  base: process.env.DEPLOY_TARGET === 'pages' ? '/mutual-fund-recos/' : '/',
})
