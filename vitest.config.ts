import { configDefaults, defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: [],
    passWithNoTests: true,
    // Other git worktrees live under .claude/worktrees; their tests belong to
    // their own checkouts and must not run (or write files) from this one.
    exclude: [...configDefaults.exclude, '.claude/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
