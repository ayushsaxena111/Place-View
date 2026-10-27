import { Annotation } from "@langchain/langgraph";


const InterviewState = Annotation.Root({
    // "start" | "answer" | "summary"
    action: Annotation(),

    // start
    type: Annotation(),
    role: Annotation(),
    useResume: Annotation(),
    resume: Annotation(),
    questionCount: Annotation(),
    plan: Annotation(),
    firstQuestion: Annotation(),

    // answer / summary
    interview: Annotation(),      // plain snapshot of the interview document
    index: Annotation(),          // index of the question being answered
    current: Annotation(),        // that question, with the candidate's answer fields filled in
    feedback: Annotation(),
    questions: Annotation(),      // questions after recording the answer + feedback
    decision: Annotation(),
    nextQuestion: Annotation(),
    completed: Annotation(),
    report: Annotation(),
})


export default InterviewState
