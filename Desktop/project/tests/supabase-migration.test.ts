import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationPath = resolve(process.cwd(), 'supabase/migrations/20261124220000_complete_application_schema.sql')

describe('complete Supabase application migration', () => {
  const migration = readFileSync(migrationPath, 'utf8')

  it('creates app_state with row-level security', () => {
    expect(migration).toContain('create table if not exists public.app_state')
    expect(migration).toContain('alter table public.app_state enable row level security')
  })

  it('creates separate public, user, teacher, and admin scopes', () => {
    expect(migration).toContain("'public', 'authenticated', 'user', 'teacher', 'admin'")
    expect(migration).toContain('users write own app state')
    expect(migration).toContain('teachers write teacher app state')
    expect(migration).toContain('admins write global app state')
  })

  it('creates a private 10 MB attachments bucket and storage policies', () => {
    expect(migration).toContain("'app-attachments'")
    expect(migration).toContain('10485760')
    expect(migration).toContain('users read own attachments')
    expect(migration).toContain('users delete own attachments')
  })
})
