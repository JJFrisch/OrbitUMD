import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      // Alias @ to the src directory
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    // The requirements catalog data bundle is intentionally large and loaded lazily.
    chunkSizeWarningLimit: 5500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('umd_program_requirements.json')) {
            return 'requirements-data'
          }

          if (!id.includes('node_modules')) {
            return undefined
          }

          if (id.includes('react-router')) {
            return 'router'
          }

          if (id.includes('@supabase/')) {
            return 'supabase'
          }

          if (id.includes('@radix-ui/')) {
            return 'radix'
          }

          if (id.includes('lucide-react')) {
            return 'icons'
          }

          if (id.includes('react-dnd') || id.includes('dnd-core')) {
            return 'dnd'
          }

          if (id.includes('recharts')) {
            return 'charts'
          }

          if (id.includes('@mui/') || id.includes('@emotion/')) {
            return 'mui'
          }

          if (id.includes('pdfjs-dist')) {
            return 'pdf'
          }

          return 'vendor'
        },
      },
    },
  },

  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  assetsInclude: ['**/*.svg', '**/*.csv'],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    globals: true,
    css: true,
  },
})
