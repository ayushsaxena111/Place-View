import { useEffect, useState } from 'react'
import Step3report from '../components/interview/Step3report'
import { useNavigate, useParams } from 'react-router-dom'
import { getInterview } from '../apis/interview.api'

function InterviewReport({ user, setUser }) {
  const { id } = useParams()
  const [report, setReport] = useState(null)
  const [error, setError] = useState("")
  const navigate = useNavigate()

  useEffect(() => {
    let cancelled = false
    const fetchReport = async () => {
      const response = await getInterview(id)
      if (cancelled) return
      const data = response?.interview
      if (!response?.success || !data) {
        setError(response?.message || "Report not found.")
        return
      }
      if (data.status !== "completed") {
        navigate(`/interview/${id}`, { replace: true });
        return;
      }
      setReport(data)
    }

    fetchReport()
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

  if (!report) {
    return (
      <div className="min-h-screen bg-[#07000F] flex items-center justify-center">
        <div className="w-12 h-12 rounded-full border-4 border-white/20 border-t-white animate-spin" />
      </div>
    )
  }

  return (
    <Step3report
      user={user}
      setUser={setUser}
      report={report}
      onReportChange={setReport}
    />
  )
}

export default InterviewReport
