import { END, START, StateGraph } from "@langchain/langgraph";
import InterviewState from "./state.js";
import { decideNode, feedbackNode, nextQuestionNode, planNode, summaryNode } from "./nodes.js";

//  start   → planAgent → END
//  answer  → feedbackAgent → decide ─┬─ complete → summaryAgent → END
//                                    ├─ generate → nextQuestionAgent → END
//                                    └─ follow-up / existing → END
//  summary → summaryAgent → END

function router(state) {
    switch (state.action) {
        case "start":
            return "planAgent";
        case "answer":
            return "feedbackAgent";
        case "summary":
            return "summaryAgent";
        default:
            return END;
    }
}

function afterDecide(state) {
    if (state.completed) return "summaryAgent";
    if (state.decision?.type === "generate") return "nextQuestionAgent";
    return END;
}

const graph = new StateGraph(InterviewState)
    .addNode("planAgent", planNode)
    .addNode("feedbackAgent", feedbackNode)
    .addNode("decide", decideNode)
    .addNode("nextQuestionAgent", nextQuestionNode)
    .addNode("summaryAgent", summaryNode)
    .addConditionalEdges(START, router, {
        planAgent: "planAgent",
        feedbackAgent: "feedbackAgent",
        summaryAgent: "summaryAgent",
        [END]: END,
    })
    .addEdge("planAgent", END)
    .addEdge("feedbackAgent", "decide")
    .addConditionalEdges("decide", afterDecide, {
        summaryAgent: "summaryAgent",
        nextQuestionAgent: "nextQuestionAgent",
        [END]: END,
    })
    .addEdge("nextQuestionAgent", END)
    .addEdge("summaryAgent", END)
    .compile();

export default graph
