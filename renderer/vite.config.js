import { defineConfig } from 'vite'

export default defineConfig({
  base: '/waifu-assistant/',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: './index.html',
    }
  }
})