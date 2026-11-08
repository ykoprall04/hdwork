import { createContext } from "react";
export type User = {
  modules?: string[]
  id: number
  name: string
  username: string
  role: string
  city_id: number | null
}

type AuthContextType = {
  user: User | null
  token: string | null
  login: (token: string, user: User) => void
  logout: () => void
}

export const AuthContext =
  createContext<AuthContextType | undefined>(
    undefined,
  )
