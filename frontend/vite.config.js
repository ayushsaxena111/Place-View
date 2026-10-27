import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// This file was missing from the repository. Without the Tailwind plugin,
// `@import "tailwindcss"` is never processed and the build ships no utility
// classes. If you already have a local vite.config.js, make sure it includes
// both plugins below.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
  },
})
