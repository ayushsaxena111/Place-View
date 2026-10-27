import api from "../utils/axios"

export const getCurrentUser = async () => {
    try {
        const response = await api.get("/api/me")
        return response.data
    } catch {
        return null
    }
}

// Spend coins for client-side features (PDF download). Server-side features
// (interviews, roadmaps, resume analysis) are charged by the backend.
// Renamed from `useCoins`: the "use" prefix is reserved for React hooks.
export const spendCoins = async (data) => {
    const response = await api.post("/api/auth/use-coins", data)
    return response.data
}
