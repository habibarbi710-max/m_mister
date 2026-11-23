import type { ApiResult, AuthCredential, Section, User } from '@/types'
import { demoUsers } from '@/lib/mock-data'
import { signIn, signOut, registerUser, getCurrentUser, createTeacherAccount, getAuthCredentials, saveAuthCredentials, addMissingDemoUsers } from './api'

export type AuthAccount = AuthCredential

const bytesToHex = (bytes: Uint8Array) => Array.from(bytes).map((byte) => byte.toString(16).padStart(2, '0')).join('')

export async function hashPassword(password: string, salt = crypto.getRandomValues(new Uint8Array(16)).join(',')): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits'])
  const saltBytes = new TextEncoder().encode(salt)
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: saltBytes, iterations: 100000, hash: 'SHA-256' }, key, 256)
  return `${salt}$${bytesToHex(new Uint8Array(bits))}`
}

async function ensureSeeds(): Promise<AuthAccount[]> {
  let accounts = await getAuthCredentials()
  const knownIds = new Set(accounts.map((account) => account.user.id))
  const missingUsers = demoUsers.filter((user) => !knownIds.has(user.id))
  if (missingUsers.length > 0) {
    const newAccounts = await Promise.all(missingUsers.map(async (user) => {
      const password = user.role === 'admin' ? 'Admin123!' : user.role === 'teacher' ? 'Teacher123!' : 'Student123!'
      return { user, passwordHash: await hashPassword(password) }
    }))
    accounts = [...accounts, ...newAccounts]
    await saveAuthCredentials(accounts)
  }
  await addMissingDemoUsers(demoUsers)
  return accounts
}

export async function authLogin(identifier: string, password: string): Promise<ApiResult<User>> {
  if (!identifier || !password) return { ok: false, error: 'Email and password are required' }
  const accounts = await ensureSeeds()
  const normalized = identifier.trim().toLowerCase()
  const account = accounts.find((item) => item.user.email.toLowerCase() === normalized || item.user.phone.replace(/\s/g, '').toLowerCase() === normalized.replace(/\s/g, ''))
  if (!account) return { ok: false, error: 'Email or password is incorrect' }
  if (account.user.blocked) return { ok: false, error: 'This account is blocked' }
  const [salt] = account.passwordHash.split('$')
  const actual = await hashPassword(password, salt)
  if (actual !== account.passwordHash) return { ok: false, error: 'Email or password is incorrect' }
  try {
    const signedIn = await signIn(identifier)
    return { ok: true, data: signedIn }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Email or password is incorrect' }
  }
}

export async function authRegister(input: { name: string; email: string; phone: string; password: string; section: Section; sectionId?: string }): Promise<ApiResult<User>> {
  const accounts = await ensureSeeds()
  if (accounts.some((item) => (input.email && item.user.email.toLowerCase() === input.email.trim().toLowerCase())
    || (input.phone && item.user.phone.replace(/\s/g, '') === input.phone.replace(/\s/g, '')))) {
    return { ok: false, error: 'This email is already registered' }
  }
  const user: User = { id: `student-${Date.now()}`, name: input.name.trim(), email: input.email.trim().toLowerCase(), phone: input.phone.trim(), section: input.section, sectionId: input.sectionId, role: 'student' }
  const account: AuthAccount = { user, passwordHash: await hashPassword(input.password) }
  await registerUser(user)
  await saveAuthCredentials([...accounts, account])
  return { ok: true, data: user }
}

export async function authCreateTeacher(input: { name: string; email: string; phone: string; password: string; section: Section }): Promise<ApiResult<User>> {
  const response = await createTeacherAccount({ name: input.name, email: input.email, phone: input.phone, section: input.section })
  if (!response.ok) return response
  const account: AuthAccount = { user: response.data, passwordHash: await hashPassword(input.password) }
  await saveAuthCredentials([...await getAuthCredentials(), account])
  return response
}

export async function authLogout(): Promise<void> { await signOut() }
export async function authSession(): Promise<User | null> { return getCurrentUser() }

export async function authChangePassword(currentPassword: string, nextPassword: string): Promise<ApiResult<User>> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'You must be logged in' }
  const accounts = await ensureSeeds()
  const account = accounts.find((item) => item.user.id === user.id)
  if (!account) return { ok: false, error: 'Account not found' }
  const [salt] = account.passwordHash.split('$')
  const actual = await hashPassword(currentPassword, salt)
  if (actual !== account.passwordHash) return { ok: false, error: 'Current password is incorrect' }
  const nextHash = await hashPassword(nextPassword)
  const updated = accounts.map((item) => item.user.id === user.id ? { ...item, passwordHash: nextHash } : item)
  await saveAuthCredentials(updated)
  return { ok: true, data: user }
}
