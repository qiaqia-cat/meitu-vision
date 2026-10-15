import type { PublicUser, UserAccount } from '@/types/auth'
import { openDb, USER_STORE_NAME } from '@/utils/idb'

const SESSION_KEY = 'meitu-vision-session-user-id'

function normalizePhone(phone: string) {
  return phone.replace(/\s|-/g, '')
}

function isValidPhone(phone: string) {
  return /^\+?\d{10,15}$/.test(phone)
}

function toPublicUser(user: UserAccount): PublicUser {
  const { passwordHash: _passwordHash, ...publicUser } = user
  return publicUser
}

async function hashPassword(password: string) {
  const data = new TextEncoder().encode(password)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function getUserByPhone(phone: string): Promise<UserAccount | undefined> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(USER_STORE_NAME, 'readonly')
    const request = tx.objectStore(USER_STORE_NAME).index('phone').get(phone)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function getUserById(id: string): Promise<UserAccount | undefined> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(USER_STORE_NAME, 'readonly')
    const request = tx.objectStore(USER_STORE_NAME).get(id)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function putUser(user: UserAccount) {
  const db = await openDb()
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(USER_STORE_NAME, 'readwrite')
    tx.objectStore(USER_STORE_NAME).put(user)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function registerWithPhone(phoneInput: string, password: string, displayNameInput: string, avatarDataUrl?: string) {
  const phone = normalizePhone(phoneInput)
  const displayName = displayNameInput.trim() || `User ${phone.slice(-4)}`

  if (!isValidPhone(phone)) throw new Error('Enter a valid mobile number.')
  if (password.length < 6) throw new Error('Password must be at least 6 characters.')
  if (await getUserByPhone(phone)) throw new Error('This phone number is already registered.')

  const now = new Date().toISOString()
  const user: UserAccount = {
    id: crypto.randomUUID(),
    phone,
    displayName,
    avatarDataUrl,
    passwordHash: await hashPassword(password),
    createdAt: now,
    lastLoginAt: now
  }

  await putUser(user)
  localStorage.setItem(SESSION_KEY, user.id)
  return toPublicUser(user)
}

export async function loginWithPhone(phoneInput: string, password: string) {
  const phone = normalizePhone(phoneInput)
  const user = await getUserByPhone(phone)
  if (!user || user.passwordHash !== await hashPassword(password)) {
    throw new Error('Phone number or password is incorrect.')
  }

  const nextUser = { ...user, lastLoginAt: new Date().toISOString() }
  await putUser(nextUser)
  localStorage.setItem(SESSION_KEY, user.id)
  return toPublicUser(nextUser)
}

export async function getSessionUser() {
  const userId = localStorage.getItem(SESSION_KEY)
  if (!userId) return null
  const user = await getUserById(userId)
  if (!user) {
    localStorage.removeItem(SESSION_KEY)
    return null
  }
  return toPublicUser(user)
}

export function logoutUser() {
  localStorage.removeItem(SESSION_KEY)
}
