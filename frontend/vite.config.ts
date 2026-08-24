import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
 
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@azure/msal-browser': path.resolve(__dirname, 'node_modules/@azure/msal-browser/lib/msal-browser.cjs'),
    },
  },
})