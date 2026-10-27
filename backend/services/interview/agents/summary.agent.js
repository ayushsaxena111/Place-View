import llm from "../config/llm.js";
import summaryPrompt from "../prompts/summaryPrompt.js";
import { parseLLMJson } from "../../../shared/utils/llmJson.js";
import { normalizeSummary } from "../engine/normalize.js";

export const summaryAgent = async (data, model = llm) => {
    const response = await model.invoke(summaryPrompt(data));

    try {
        return normalizeSummary(parseLLMJson(response.content, { expect: "object" }));
    } catch (error) {
        console.log("Summary Agent Parse Error:", error.message);
        throw new Error("Failed to generate Summary");
    }
};
