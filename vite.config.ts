import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { inspectAttr } from 'kimi-plugin-inspect-react'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [inspectAttr(), react()],
  server: {
    port: 3000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return;
          const normalized = id.replace(/\\/g, '/');
          if (normalized.includes('node_modules/xlsx')) return 'xlsx';
          if (normalized.includes('node_modules/pdfjs-dist')) return 'pdfjs';
          if (normalized.includes('node_modules/pdf-lib')) return 'pdflib';
          if (normalized.includes('node_modules/recharts')) return 'charts';
          if (normalized.includes('node_modules/react-dom') || normalized.includes('node_modules/react/')) return 'vendor';
          if (normalized.includes('node_modules/react-router')) return 'vendor';
          if (normalized.includes('node_modules/@radix-ui')) return 'ui';
          if (normalized.includes('node_modules/lucide-react')) return 'ui';
        },
      },
    },
  },
});
