import { buildStyles, CircularProgressbar } from 'react-circular-progressbar';
import 'react-circular-progressbar/dist/styles.css';

const format = (s) => (s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : `${s}s`)

function Timer({ timeLeft, totalTime, paused = false }) {
  const percentage = totalTime > 0 ? (timeLeft / totalTime) * 100 : 0
  const low = timeLeft <= Math.min(30, totalTime * 0.2)
  return (
    <div className='w-20 h-20' title={paused ? "Timer starts after the question is read" : "Time left"}>
      <CircularProgressbar
        value={percentage}
        text={format(timeLeft)}
        styles={buildStyles({
          textSize: timeLeft >= 60 ? "22px" : "28px",
          pathColor: low ? "#ef4444" : "#10b981",
          textColor: paused ? "#9ca3af" : low ? "#ef4444" : "#f4f4f5",
          trailColor: "#374151",
        })}
      />
    </div>
  )
}

export default Timer
