export type UserRole = 'user' | 'admin' | 'agent'
export type UserStatus = 'active' | 'inactive' | 'suspended'

export interface AppUser {
  id: string
  uid: string
  email: string
  fullName: string
  displayName?: string
  phone?: string
  photoURL?: string
  role: UserRole
  status: UserStatus
  createdAt: { seconds: number; nanoseconds: number } | null
  updatedAt?: { seconds: number; nanoseconds: number } | null
}
