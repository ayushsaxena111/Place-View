import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import llm from "../configs/llm.js";
import searchVideo from "../configs/youtube.js";
import { filterReachable } from "../configs/linkCheck.js";
import { parseLLMJson } from "../../../shared/utils/llmJson.js";


const resourceAgent = async (state) => {
    try {
        const roadmap = state.roadmap
        const moduleTitles = roadmap.modules.map((module) => module.title).join("\n");

        const docsResponse = await llm.invoke([
            new SystemMessage(`
You are an expert software engineer.

For every module below return the official documentation.

Rules:

1. Prefer official documentation.
2. If official documentation does not exist, return the best learning article.
3. Only return URLs you are confident exist. Leave "article" empty if unsure.
4. Return ONLY valid JSON.
5. Do not explain anything.
6. Keep the same title.

Return format:

[
  {
    "title":"",
    "article":""
  }
]
`), new HumanMessage(`Modules: ${moduleTitles}`)
        ])

        let docs = [];

        try {
            docs = parseLLMJson(docsResponse.content, { expect: "array" });
        } catch {
            docs = [];
        }

        const docsMap = new Map()

        docs.forEach((item) => {
            if (typeof item?.title === "string" && typeof item?.article === "string") {
                docsMap.set(item.title.toLowerCase(), item.article.trim())
            }
        });

        // Drop invented or dead links instead of showing them.
        const reachable = await filterReachable([...docsMap.values()])

        roadmap.modules = await Promise.all(

            roadmap.modules.map(async (module) => {

                let video = null;

                try {
                    video = await searchVideo(module.title);
                } catch (err) {
                    console.log(err.message);
                }

                const article = docsMap.get(module.title.toLowerCase()) || "";

                return {
                    ...module,
                    youtube: video?.url || "",
                    article: reachable.has(article) ? article : "",
                };

            })

        );

        return {
            ...state,
            roadmap,
        };

    } catch (error) {
        console.log(error);

        return state;
    }
}

export default resourceAgent
