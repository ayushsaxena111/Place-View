import { feedbackAgent } from "../agents/feedback.agent.js";
import { planAgent } from "../agents/plan.agent.js";
import { questionAgent } from "../agents/question.agent.js";
import { summaryAgent } from "../agents/summary.agent.js";
import {
    computeOverallScore,
    countProgress,
    decideNextDifficulty,
    DEFAULT_MAX_FOLLOW_UPS,
    normalizeLevel,
    shouldAskFollowUp,
    TIMER_BOUNDS,
} from "../engine/adaptive.js";
import { groundKeywords, mergeUnique, normalizeSummary } from "../engine/normalize.js";
import { summarizeCommunication } from "../engine/speech.js";

// ── start ───────────────────────────────────────────────────────────────

export async function planNode(state) {
    const { plan, firstQuestion } = await planAgent({
        role: state.role,
        type: state.type,
        resume: state.useResume ? state.resume : null,
        questionCount: state.questionCount,
    });
    return { plan, firstQuestion };
}

// ── answer ──────────────────────────────────────────────────────────────

export async function feedbackNode(state) {
    const { interview, current, index } = state;
    const previous = interview.questions.slice(0, index);
    const { followUpsUsed } = countProgress(previous);

    const feedback = await feedbackAgent({
        role: interview.role,
        type: interview.type,
        question: current.question,
        questionType: current.questionType || "verbal",
        topic: current.topic,
        difficulty: current.difficulty,
        answer: current.userAnswer,
        codeLanguage: current.codeLanguage,
        answerMode: current.answerMode,
        timeTakenSec: current.timeTakenSec,
        timer: current.timer,
        timedOut: current.timedOut,
        isFollowUp: current.isFollowUp,
        recentFeedback: previous.map((q) => q.feedback?.feedback).filter(Boolean).slice(-3),
        canFollowUp: Boolean(interview.adaptive) && !current.isFollowUp &&
            followUpsUsed < (interview.maxFollowUps ?? DEFAULT_MAX_FOLLOW_UPS),
    });

    return { feedback };
}

// Deterministic: record the answer, then decide between follow-up, next
// question (with difficulty), or completion.
export async function decideNode(state) {
    const { interview, current, index, feedback } = state;

    const { followUp, ...storedFeedback } = feedback;
    if (followUp?.needed) storedFeedback.followUpReason = followUp.reason || "";

    const questions = interview.questions.map((q, i) =>
        i === index ? { ...current, feedback: storedFeedback, answered: true } : q
    );

    // Interviews created before adaptive mode: fixed, pre-generated questions.
    if (!interview.adaptive) {
        const completed = index + 1 >= questions.length;
        return {
            questions,
            completed,
            decision: { type: completed ? "complete" : "existing", reason: "" },
        };
    }

    const { mainAnswered, followUpsUsed } = countProgress(questions);
    const maxFollowUps = interview.maxFollowUps ?? DEFAULT_MAX_FOLLOW_UPS;

    if (shouldAskFollowUp({ feedback, question: current, followUpsUsed, maxFollowUps })) {
        return {
            questions,
            completed: false,
            decision: { type: "follow-up", difficulty: normalizeLevel(current.difficulty), reason: followUp.reason },
            nextQuestion: {
                question: followUp.question,
                difficulty: normalizeLevel(current.difficulty),
                timer: TIMER_BOUNDS.verbal.fallback,
                questionType: "verbal",
                topic: current.topic || "",
                isFollowUp: true,
                followUpOf: index,
                difficultyReason: followUp.reason
                    ? `Follow-up to probe deeper: ${followUp.reason}`
                    : "Follow-up to test deeper understanding of your previous answer.",
            },
        };
    }

    if (mainAnswered >= interview.totalQuestions) {
        return { questions, completed: true, decision: { type: "complete", reason: "" } };
    }

    const scores = questions
        .filter((q) => q.answered || q.userAnswer)
        .map((q) => Number(q.feedback?.score) || 0);
    const next = decideNextDifficulty(current.difficulty, scores);
    const slot = interview.plan[mainAnswered] || { topic: "", questionType: "verbal" };

    return {
        questions,
        completed: false,
        decision: { type: "generate", difficulty: next.difficulty, change: next.change, reason: next.reason, slot },
    };
}

export async function nextQuestionNode(state) {
    const { interview, questions, decision } = state;
    const question = await questionAgent({
        role: interview.role,
        type: interview.type,
        resume: interview.useResume ? interview.resumeContext : null,
        slot: decision.slot,
        difficulty: decision.difficulty,
        questions,
    });
    return { nextQuestion: { ...question, difficultyReason: decision.reason } };
}

// ── summary ─────────────────────────────────────────────────────────────

export async function summaryNode(state) {
    const interview = state.interview;
    const questions = state.questions || interview.questions;
    const answered = questions.filter((q) => q.answered || q.userAnswer);

    const overallScore = computeOverallScore(questions) ?? 0;
    const communication = summarizeCommunication(questions);
    const answers = answered.map((q) => q.userAnswer || "");
    const perQuestionSkills = mergeUnique(...answered.map((q) => q.feedback?.technicalSkills));
    const perQuestionConcepts = mergeUnique(...answered.map((q) => q.feedback?.keyConceptsCovered));

    let narrative = null;
    let summaryError = "";
    try {
        narrative = await summaryAgent({
            role: interview.role,
            type: interview.type,
            questions: answered,
            overallScore,
            difficultyPath: answered.map((q) => `${q.difficulty}${q.isFollowUp ? "(follow-up)" : ""}`).join(" → "),
            communication,
        });
    } catch (error) {
        console.log("Summary generation failed:", error.message);
        summaryError = error.message || "Summary generation failed";
        narrative = normalizeSummary({});
    }

    const technicalSkills = mergeUnique(
        perQuestionSkills,
        groundKeywords(narrative.technicalSkills, answers)
    ).slice(0, 20);
    const keywords = mergeUnique(
        groundKeywords(narrative.keywords, answers),
        groundKeywords(perQuestionConcepts, answers)
    ).slice(0, 30);

    return {
        report: {
            overallScore,
            summary: narrative.summary,
            strengths: narrative.strengths,
            weaknesses: narrative.weaknesses,
            improvementAreas: narrative.improvementAreas,
            recommendations: narrative.recommendations,
            technicalSkills,
            keywords,
            communication: { ...communication, feedback: narrative.communicationFeedback || "" },
            summaryStatus: summaryError ? "failed" : "ready",
            summaryError,
        },
    };
}
