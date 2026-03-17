import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

const sharedTypesPath = fileURLToPath(new URL('../../packages/shared/src', import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@shared/types': sharedTypesPath,
    },
  },
})
