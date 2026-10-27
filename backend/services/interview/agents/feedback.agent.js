import llm from "../config/llm.js";
import feedbackPrompt from "../prompts/feedbackPrompt.js";
import { parseLLMJson } from "../../../shared/utils/llmJson.js";
import { isNoAnswer, normalizeFeedback } from "../engine/normalize.js";

export const feedbackAgent = async (data, model = llm) => {
    const noAnswer = isNoAnswer(data.answer);

    const response = await model.invoke(feedbackPrompt({
        ...data,
        answer: noAnswer ? "(no answer given)" : data.answer,
        canFollowUp: data.canFollowUp !== false && !noAnswer,
    }));

    try {
        return normalizeFeedback(parseLLMJson(response.content, { expect: "object" }), { noAnswer });
    } catch (error) {
        console.log("Feedback Agent Parse Error:", error.message);
        throw new Error("Failed to generate feedback");
    }
};
