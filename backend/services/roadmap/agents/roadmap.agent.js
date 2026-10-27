














































import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import llm from "../configs/llm.js";
import roadmapPrompt from "../configs/roadmap.prompt.js";
import { parseLLMJson } from "../../../shared/utils/llmJson.js";

const capitalize = (value = "") =>
    String(value).charAt(0).toUpperCase() +
    String(value).slice(1).toLowerCase();

const LEVELS = ["Beginner", "Intermediate", "Advanced"];
const DIFFICULTIES = ["Easy", "Medium", "Hard"];

const text = (value, max = 1000) => (typeof value === "string" ? value.trim().slice(0, max) : "");
const list = (value, maxItems = 8) =>
    Array.isArray(value)
        ? value.map((v) => text(typeof v === "string" ? v : v?.name, 80)).filter(Boolean).slice(0, maxItems)
        : [];

export const resumeForPrompt = (resume) =>
    resume
        ? {
            skills: resume.skills,
            missingSkills: resume.missingSkills,
            projects: resume.projects,
            experience: resume.experience,
            score: resume.score,
            suggestedRole: resume.suggestedRole,
            recommendations: resume.recommendations,
            weaknesses: resume.weaknesses,
        }
        : null;

export const buildRoadmapRequest = (state) => `
Target Role:
${state.role}

Target Package:
${state.targetPackage}

Time Available:
${state.durationWeeks
        ? `${state.durationWeeks} weeks at about ${state.hoursPerWeek} study hours per week (about ${state.durationWeeks * state.hoursPerWeek} hours in total)`
        : `Decide the total duration yourself; the user can study about ${state.hoursPerWeek} hours per week`}

Resume:
${JSON.stringify(state.useResume ? resumeForPrompt(state.resume) : null, null, 2)}

Interview Results:
${JSON.stringify(state.insights || null, null, 2)}
`;

export const normalizeRoadmap = (raw) => {
    const modules = (Array.isArray(raw.modules) ? raw.modules : [])
        .map((module) => {
            const difficulty = capitalize(module?.difficulty);
            return {
                title: text(module?.title, 200),
                difficulty: DIFFICULTIES.includes(difficulty) ? difficulty : "Medium",
                description: text(module?.description, 1000),
                estimatedHours: Number(module?.estimatedHours) > 0 ? Math.round(Number(module.estimatedHours)) : 0,
                duration: text(module?.duration, 100),
                skills: list(module?.skills),
                whyIncluded: text(module?.whyIncluded, 400),
                practiceTask: text(module?.practiceTask, 400),
            };
        })
        .filter((module) => module.title && module.description)
        .slice(0, 15);

    if (modules.length < 3) {
        throw new Error("The AI returned too few roadmap modules.");
    }

    const level = capitalize(raw.level);
    return {
        title: text(raw.title, 200) || "Learning Roadmap",
        targetPackage: text(raw.targetPackage, 50),
        level: LEVELS.includes(level) ? level : "Intermediate",
        summary: text(raw.summary, 1200),
        totalWeeks: Number(raw.totalWeeks) > 0 ? Math.round(Number(raw.totalWeeks)) : null,
        duration: text(raw.duration, 100),
        modules,
        milestones: Array.isArray(raw.milestones) ? raw.milestones : [],
    };
};

// Graph node. LangGraph passes its run config as the second argument, so the
// model is injected through generateRoadmap rather than a node parameter.
const roadmapAgent = async (state) => generateRoadmap(state, llm);

export const generateRoadmap = async (state, model) => {
    try {
        const response = await model.invoke([
            new SystemMessage(roadmapPrompt),
            new HumanMessage(buildRoadmapRequest(state))
        ]);

        const roadmap = normalizeRoadmap(parseLLMJson(response.content, { expect: "object" }));

        return {
            ...state,
            roadmap
        };

    } catch (error) {
        console.log("Roadmap Agent Error:", error);

        throw new Error(
            error.message || "Failed to generate roadmap."
        );
    }
};

export default roadmapAgent;
// Origial code here 
// import { HumanMessage, SystemMessage } from "@langchain/core/messages";
// import llm from "../configs/llm.js";
// import roadmapPrompt from "../configs/roadmap.prompt.js";


// const roadmapAgent = async (state) => {
//     try {
//         const resume = state.useResume
//             ? {
//                 skills: state.resume.skills,
//                 missingSkills: state.resume.missingSkills,
//                 projects: state.resume.projects,
//                 experience: state.resume.experience,
//                 score: state.resume.score,
//                 suggestedRole: state.resume.suggestedRole,
//                 recommendations: state.resume.recommendations,
//             }
//             : null;

//         const response = await llm.invoke([
//             new SystemMessage(roadmapPrompt),
//             new HumanMessage(`
// Target Role:
// ${state.role}

// Target Package:
// ${state.targetPackage}

// Resume:
// ${JSON.stringify(resume, null, 2)}

// `)
//         ]);

//         const roadmap = JSON.parse(response.content
//             .replace(/```json/g, "")
//             .replace(/```/g, "")
//             .trim())

//              const capitalize = (value = "") =>
//       value.charAt(0).toUpperCase() +
//       value.slice(1).toLowerCase();

//     roadmap.level = capitalize(roadmap.level);

//     roadmap.modules = (roadmap.modules || []).map((module) => ({
//       ...module,
//       difficulty: capitalize(module.difficulty),
//     }));

//     return {
//         ...state,
//         roadmap
//     }




//     } catch (error) {
// console.log("Roadmap Agent Error");
//     console.log(error);

//     throw error;
//     }
// }


// export default roadmapAgent