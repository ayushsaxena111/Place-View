import api from "../utils/axios"
import { toApiError } from "../utils/apiError"

export const getResume = async () => {
    try {
        const response = await api.get("/api/resume/get-resume")
        return response.data
    } catch {
        return null
    }
}

// Upload and analyse a resume PDF. Coins are charged by the server.
export const uploadResume = async (file) => {
    try {
        const formData = new FormData()
        formData.append("resume", file)
        const response = await api.post("/api/resume/upload", formData)
        return response.data
    } catch (error) {
        return toApiError(error, "Resume upload failed.")
    }
}

export const getResumeHistory = async () => {
    try {
        const response = await api.get("/api/resume/history")
        return response.data
    } catch (error) {
        return toApiError(error, "Could not load resume history.")
    }
}

export const getResumeVersion = async (id) => {
    try {
        const response = await api.get(`/api/resume/history/${id}`)
        return response.data
    } catch (error) {
        return toApiError(error, "Could not load this resume.")
    }
}

export const activateResumeVersion = async (id) => {
    try {
        const response = await api.post(`/api/resume/history/${id}/activate`)
        return response.data
    } catch (error) {
        return toApiError(error, "Could not switch resume.")
    }
}

export const deleteResumeVersion = async (id) => {
    try {
        const response = await api.delete(`/api/resume/history/${id}`)
        return response.data
    } catch (error) {
        return toApiError(error, "Could not delete this resume.")
    }
}

// Fetch the original PDF (authenticated) and return a temporary object URL.
export const getResumeFileUrl = async (id) => {
    try {
        const response = await api.get(`/api/resume/history/${id}/file`, { responseType: "blob" })
        return { success: true, url: URL.createObjectURL(response.data) }
    } catch (error) {
        let message = "Could not open the PDF."
        try {
            const text = await error?.response?.data?.text?.()
            message = JSON.parse(text).message || message
        } catch {
            // keep the generic message
        }
        return { success: false, message }
    }
}
