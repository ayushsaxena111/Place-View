import { FiCode, FiEdit3, FiMic } from 'react-icons/fi'

// Display information for each interview question type.
export const QUESTION_TYPES = {
    verbal: {
        label: "Verbal",
        icon: FiMic,
        hint: "Answer out loud — your speech is transcribed below. You can edit the text before submitting.",
        className: "bg-sky-500/15 text-sky-300 border-sky-400/30",
    },
    written: {
        label: "Written",
        icon: FiEdit3,
        hint: "Type your answer. The microphone is paused for written questions.",
        className: "bg-amber-500/15 text-amber-300 border-amber-400/30",
    },
    coding: {
        label: "Coding",
        icon: FiCode,
        hint: "Write your solution in the editor. JavaScript and Python can be run in the browser to test it.",
        className: "bg-violet-500/15 text-violet-300 border-violet-400/30",
    },
}

export const typeInfo = (type) => QUESTION_TYPES[type] || QUESTION_TYPES.verbal
