import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// Unit tests for the pure logic (dates, scheduling, workspace routing, permissions, planning guards). They never touch
// the database: anything that needs Supabase is covered by the SQL rehearsal scripts and by checking the live app.
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./', import.meta.url)) } },
  test: { include: ['lib/**/*.test.ts'], environment: 'node' },
})
