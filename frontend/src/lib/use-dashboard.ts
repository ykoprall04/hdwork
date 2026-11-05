import { useEffect, useReducer, useState } from "react"
import { getDashboardCities, getDashboardSummary, getTeamMembers, type DashboardCity, type DashboardSummary, type TeamMember } from "@/services/dashboard.service"
import { getOrders, type Order } from "@/services/order.service"

type State = {
  loading: boolean
  summary: DashboardSummary | null
  orders: Order[] | null
  members: TeamMember[] | null
  cities: DashboardCity[]
  errors: Partial<Record<"summary" | "orders" | "members" | "cities", string>>
  updatedAt: Date | null
}
const initial: State = { loading: true, summary: null, orders: null, members: null, cities: [], errors: {}, updatedAt: null }

export function useDashboard(token: string | null, cityId: string, role?: string) {
  const [state, dispatch] = useReducer((_state: State, next: State) => next, initial)
  const [revision, setRevision] = useState(0)
  const admin = role === "ADMIN" || role === "SUPER_ADMIN"
  useEffect(() => {
    let current = true
    dispatch(initial)
    if (!token) return () => { current = false }
    const accessToken = token
    async function load() {
      const [summary, orders, members, cities] = await Promise.allSettled([
        getDashboardSummary(accessToken, cityId),
        getOrders(accessToken, { cityId }),
        admin ? getTeamMembers(accessToken, cityId) : Promise.resolve(null),
        role === "SUPER_ADMIN" ? getDashboardCities(accessToken) : Promise.resolve([]),
      ])
      if (!current) return
      const errors: State["errors"] = {}
      for (const [key, result] of [["summary", summary], ["orders", orders], ["members", members], ["cities", cities]] as const) {
        if (result.status === "rejected") errors[key] = result.reason instanceof Error ? result.reason.message : "Layanan tidak dapat dijangkau"
      }
      dispatch({
        loading: false,
        summary: summary.status === "fulfilled" ? summary.value : null,
        orders: orders.status === "fulfilled" ? orders.value : null,
        members: members.status === "fulfilled" ? members.value : null,
        cities: cities.status === "fulfilled" ? cities.value : [],
        errors,
        updatedAt: new Date(),
      })
    }
    void load()
    return () => { current = false }
  }, [token, cityId, role, admin, revision])
  return { ...state, refresh: () => setRevision((value) => value + 1) }
}
