import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider, type Auth } from 'firebase/auth'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

const apiKey = import.meta.env.VITE_FIREBASE_API_KEY
const authDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN
const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID
const hasConfig =
  typeof apiKey === 'string' &&
  apiKey.length > 0 &&
  typeof authDomain === 'string' &&
  authDomain.length > 0 &&
  typeof projectId === 'string' &&
  projectId.length > 0

const app = hasConfig ? initializeApp(firebaseConfig) : null
export const auth: Auth | null = app ? getAuth(app) : null
export const googleProvider = new GoogleAuthProvider()

/** Allowed email domain for login (Stanford only). */
export const ALLOWED_EMAIL_DOMAIN = 'stanford.edu'

export function isAllowedEmail(email: string | null | undefined): boolean {
  if (email === null || email === undefined) return false
  const domain = email.trim().toLowerCase().split('@')[1]
  return domain === ALLOWED_EMAIL_DOMAIN
}
