export interface UserAccount {
  id: string
  phone: string
  displayName: string
  avatarDataUrl?: string
  passwordHash: string
  createdAt: string
  lastLoginAt: string
}

export type PublicUser = Pick<UserAccount, 'id' | 'phone' | 'displayName' | 'avatarDataUrl' | 'createdAt' | 'lastLoginAt'>
