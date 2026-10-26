import path from 'node:path'
import { defineConfig } from 'prisma/config'

const devDbPath = path.resolve(__dirname, 'prisma', 'dev.db')

// Used by the Prisma CLI (migrate, generate, studio) during development.
// At runtime the adapter is passed directly to PrismaClient in src/main/db/prisma.ts.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    // Support DATABASE_URL env var for migrations at runtime, fallback to dev.db for CLI
    url: process.env.DATABASE_URL || `file:${devDbPath}`,
  },
})
