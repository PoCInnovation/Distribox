import { Policy, type User } from "./types"

export function isAdmin(user?: User | null): boolean {
  return user?.policies.find(p => p.policy === Policy.ADMIN) !== undefined
}
