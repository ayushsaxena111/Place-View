import api from "../utils/axios"
import { toApiError } from "../utils/apiError"

// Coins are charged by the server when a roadmap is generated or updated.
export const generateRoadmap = async (data) => {
    try {
        const response = await api.post("/api/roadmap/generate", data)
        return response.data
    } catch (error) {
        return toApiError(error, "Something went wrong while generating your roadmap. Please try again.")
    }
}

export const getAllRoadmaps = async () => {
    try {
        const response = await api.get("/api/roadmap/all")
        return response.data
    } catch (error) {
        return toApiError(error, "Could not load roadmaps.")
    }
}

export const getRoadmap = async (id) => {
    try {
        const response = await api.get(`/api/roadmap/${id}`)
        return response.data
    } catch (error) {
        return toApiError(error, "Could not load this roadmap.")
    }
}

export const getRoadmapByInterview = async (interviewId) => {
    try {
        const response = await api.get(`/api/roadmap/by-interview/${interviewId}`)
        return response.data
    } catch (error) {
        return toApiError(error, "Could not check for an existing roadmap.")
    }
}

export const updateModuleStatus = async (id, index, status) => {
    try {
        const response = await api.patch(`/api/roadmap/${id}/modules/${index}`, { status })
        return response.data
    } catch (error) {
        return toApiError(error, "Could not update progress.")
    }
}

export const rescheduleRoadmap = async (id, data) => {
    try {
        const response = await api.post(`/api/roadmap/${id}/reschedule`, data)
        return response.data
    } catch (error) {
        return toApiError(error, "Could not reschedule the roadmap.")
    }
}

export const deleteRoadmap = async (id) => {
    try {
        const response = await api.delete(`/api/roadmap/${id}`)
        return response.data
    } catch (error) {
        return toApiError(error, "Could not delete the roadmap.")
    }
}
