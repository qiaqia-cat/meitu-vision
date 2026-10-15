import type { SavedDesign } from '@/types/editor'

const DB_NAME = 'meitu-vision-db'
const STORE_NAME = 'designs'
export const USER_STORE_NAME = 'users'
export const BRAND_STORE_NAME = 'brandKit'
const DB_VERSION = 3

export function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(USER_STORE_NAME)) {
        const userStore = db.createObjectStore(USER_STORE_NAME, { keyPath: 'id' })
        userStore.createIndex('phone', 'phone', { unique: true })
      }
      if (!db.objectStoreNames.contains(BRAND_STORE_NAME)) {
        db.createObjectStore(BRAND_STORE_NAME, { keyPath: 'id' })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function saveDesign(design: SavedDesign) {
  const db = await openDb()
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put(design)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function getDesigns(): Promise<SavedDesign[]> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const request = tx.objectStore(STORE_NAME).getAll()
    request.onsuccess = () => resolve(request.result.sort((a, b) => b.savedAt.localeCompare(a.savedAt)))
    request.onerror = () => reject(request.error)
  })
}

export async function saveBrandRecord(record: { id: string; value: unknown }) {
  const db = await openDb()
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(BRAND_STORE_NAME, 'readwrite')
    tx.objectStore(BRAND_STORE_NAME).put(record)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export async function getBrandRecord<T>(id: string): Promise<T | null> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BRAND_STORE_NAME, 'readonly')
    const request = tx.objectStore(BRAND_STORE_NAME).get(id)
    request.onsuccess = () => resolve((request.result?.value as T) ?? null)
    request.onerror = () => reject(request.error)
  })
}
