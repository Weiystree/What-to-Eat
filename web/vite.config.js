import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: {
      // 本地开发时把 /api 转发到本地 node server.js（npm run dev:api）
      // 3000 端口在这台机器上被其他项目占用，改用 3001，需和 server.js 的默认端口保持一致
      '/api': 'http://localhost:3001'
    }
  }
})
