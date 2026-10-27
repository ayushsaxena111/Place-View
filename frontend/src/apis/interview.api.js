import api from "../utils/axios"
import { toApiError } from "../utils/apiError"

// Successful calls return the server payload. Failed calls return
// { success: false, status, message } instead of throwing, so pages can show
// the reason and offer a retry.

export const startInterview = async (data) => {
    try {
        const response = await api.post("/api/interview/start", data)
        return response.data
    } catch (error) {
        return toApiError(error, "Could not start the interview.")
    }
}

export const getInterview = async (id) => {
    try {
        const response = await api.get(`/api/interview/${id}`)
        return response.data
    } catch (error) {
        return toApiError(error, "Could not load the interview.")
    }
}

export const submitAnswer = async (data) => {
    try {
        const response = await api.post(`/api/interview/answer`, data)
        return response.data
    } catch (error) {
        return toApiError(error, "Could not submit your answer.")
    }
}

export const getAllInterviews = async () => {
    try {
        const response = await api.get(`/api/interview/all`)
        return response.data
    } catch (error) {
        return toApiError(error, "Could not load interviews.")
    }
}

export const getInterviewHistory = async ({ page = 1, limit = 20 } = {}) => {
    try {
        const response = await api.get(`/api/interview/history`, { params: { page, limit } })
        return response.data
    } catch (error) {
        return toApiError(error, "Could not load interview history.")
    }
}

export const regenerateSummary = async (id) => {
    try {
        const response = await api.post(`/api/interview/${id}/summary`)
        return response.data
    } catch (error) {
        return toApiError(error, "Could not generate the summary.")
    }
}

export const deleteInterview = async (id) => {
    try {
        const response = await api.delete(`/api/interview/${id}`)
        return response.data
    } catch (error) {
        return toApiError(error, "Could not delete the interview.")
    }
}
