// Turn an axios error into a { success: false, status, message } object the
// UI can show (plus any extra fields the server sent, e.g. interviewCoin).
export const toApiError = (error, fallback = "Something went wrong. Please try again.") => {
    const status = error?.response?.status ?? 0
    const data = error?.response?.data && typeof error.response.data === "object" ? error.response.data : {}
    let message = data.message || fallback
    if (!error?.response) message = "Cannot reach the server. Check your connection and try again."
    else if (status === 402) message = "Not enough interview coins. Buy more coins to continue."
    else if (status === 401) message = "Your session expired. Please sign in again."
    return { ...data, success: false, status, message }
}
