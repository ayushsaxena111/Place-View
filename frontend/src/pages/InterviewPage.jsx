import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getInterview } from '../apis/interview.api'
import Step2interview from '../components/interview/Step2interview'

const progressOf = (interview) => {
    const questions = interview.questions || []
    const mainAnswered = questions.filter((q) => !q.isFollowUp && (q.answered || q.userAnswer)).length
    const followUpsUsed = questions.filter((q) => q.isFollowUp).length
    const totalMain = interview.totalQuestions || questions.filter((q) => !q.isFollowUp).length
    return { mainAnswered, followUpsUsed, totalMain }
}

function InterviewPage({ user }) {
    const { id } = useParams()
    const [interview, setInterview] = useState(null)
    const [error, setError] = useState("")
    const navigate = useNavigate()

    useEffect(() => {
        let cancelled = false
        const fetchInterview = async () => {
            const response = await getInterview(id)
            if (cancelled) return
            const data = response?.interview
            if (!response?.success || !data) {
                setError(response?.message || "Interview not found.")
                return
            }
            if (data.status === "completed") {
                navigate(`/interview/${id}/report`, { replace: true });
                return;
            }
            setInterview(data)
        }

        fetchInterview()
        return () => { cancelled = true }
    }, [id, navigate])

    if (error) {
        return (
            <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-3 p-6 text-center">
                <p className="text-sm text-black/70">{error}</p>
                <button onClick={() => navigate("/history")} className="rounded-lg bg-black px-4 py-2 text-xs text-white">Go to history</button>
            </div>
        )
    }

    if (!interview) {
        return (
            <div className="min-h-screen bg-[#07000F] flex items-center justify-center">
                <div className="w-12 h-12 rounded-full border-4 border-white/20 border-t-white animate-spin" />
            </div>
        )
    }

    return (
        <Step2interview
            interviewData={{
                interviewId: interview._id,
                currentQuestion: interview.currentQuestion,
                totalQuestions: interview.totalQuestions || interview.questions.length,
                question: interview.questions[interview.currentQuestion],
                adaptive: interview.adaptive,
                progress: progressOf(interview),
            }} user={user} />
    )
}

export default InterviewPage
