import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';
import dotenv from 'dotenv';

// 載入環境變數
dotenv.config();

// https://vitejs.dev/config/
export default defineConfig(({ command, mode }) => {
  // 根據當前模式載入環境變數
  const env = loadEnv(mode, process.cwd(), '');
  
  return {
    plugins: [
      vue(),
    ],
    
    // 解析配置
    resolve: {
      alias: {
        '@': resolve(__dirname, './js'),
        '@modules': resolve(__dirname, './js/modules'),
        '@components': resolve(__dirname, './js/components'),
        '@assets': resolve(__dirname, './assets'),
      },
    },
    
    // 伺服器配置
    server: {
      port: 5173,
      open: true,
      cors: true,
    },
    
    // 建構配置
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      minify: 'terser',
      terserOptions: {
        compress: {
          drop_console: env.APP_ENV === 'production', // 生產環境下移除 console
        },
      },
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'index.html'),
          admin: resolve(__dirname, 'admin.html'),
          clockin: resolve(__dirname, 'clockin.html'),
          salary: resolve(__dirname, 'salary.html'),
          // 添加其他需要打包的入口文件
        },
        output: {
          manualChunks: {
            'vendor': ['vue', 'vue-router', 'pinia'],
            'firebase': ['firebase/app', 'firebase/auth', 'firebase/firestore'],
            'chart': ['chart.js'],
          },
        },
      },
    },
    
    // 定義環境變數前綴
    envPrefix: ['APP_', 'FIREBASE_', 'VITE_'],
    
    // 靜態資源處理
    publicDir: 'public',
    
    // PWA 配置相關
    experimental: {
      renderBuiltUrl(filename) {
        // 為靜態資源添加版本號
        if (filename.endsWith('.js') || filename.endsWith('.css')) {
          return { relative: true };
        }
        return { relative: true };
      },
    },
  };
}); 