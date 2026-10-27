import { ChatGroq } from "@langchain/groq";
import dotenv from "dotenv";

dotenv.config();

const llm = new ChatGroq({
    model: "openai/gpt-oss-120b",
    temperature: 0.2,
    maxTokens: 2500,
    maxRetries: 2
});

export default llm;

























// original project code
// import { ChatGroq } from "@langchain/groq"
// import dotenv from "dotenv"
// dotenv.config()

// const llm = new ChatGroq({
//     model: "llama-3.3-70b-versatile",
//     temperature: 0.2,
//     maxTokens: 2500,
//     maxRetries: 2,
// })

// export default llm