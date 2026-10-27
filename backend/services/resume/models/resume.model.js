import mongoose from "mongoose";

const educationSchema = new mongoose.Schema(
    {
        institution: {
            type: String,
            default: "",
        },
        degree: {
            type: String,
            default: "",
        },
        field: {
            type: String,
            default: "",
        },
        years: {
            type: String,
            default: "",
        },
        details: {
            type: String,
            default: "",
        },
    },
    { _id: false }
);

const projectSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            default: "",
        },
        duration: {
            type: String,
            default: "",
        },
        description: {
            type: String,
            default: "",
        },
        technologies: {
            type: [String],
            default: [],
        },
    },
    { _id: false }
);

const experienceSchema = new mongoose.Schema(
    {
        company: {
            type: String,
            default: "",
        },
        role: {
            type: String,
            default: "",
        },
        duration: {
            type: String,
            default: "",
        },
        description: {
            type: String,
            default: "",
        },
        technologies: {
            type: [String],
            default: [],
        },
    },
    { _id: false }
);

const resumeSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            unique: true,
            index: true,
        },

        extractedText: {
            type: String,
            required: true,
        },

        score: {
            type: Number,
            default: 0,
            min: 0,
            max: 100,
        },

        name: {
            type: String,
            default: "",
        },

        email: {
            type: String,
            default: "",
        },

        phone: {
            type: String,
            default: "",
        },

        summary: {
            type: String,
            default: "",
        },

        education: {
            type: [educationSchema],
            default: [],
        },

        skills: {
            type: [String],
            default: [],
        },

        projects: {
            type: [projectSchema],
            default: [],
        },

        experience: {
            type: [experienceSchema],
            default: [],
        },

        strengths: {
            type: [String],
            default: [],
        },

        weaknesses: {
            type: [String],
            default: [],
        },

        missingSkills: {
            type: [String],
            default: [],
        },

        suggestedRole: {
            type: String,
            default: "",
        },

        recommendations: {
            type: [String],
            default: [],
        },

        // The upload (ResumeVersion) this analysis came from.
        activeVersionId: {
            type: mongoose.Schema.Types.ObjectId,
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

const Resume = mongoose.model("Resume", resumeSchema);

export { educationSchema, projectSchema, experienceSchema };

export default Resume;


































// original code
// import mongoose from "mongoose";


// const resumeSchema = new mongoose.Schema({
//     userId: {
//       type: mongoose.Schema.Types.ObjectId,
//       required: true,
//       unique: true,
//       index: true,
//     },

//     extractedText: {
//       type: String,
//       required: true,
//     },

//     score: {
//       type: Number,
//       default: 0,
//     },

//     summary: {
//       type: String,
//       default: "",
//     },

//     name: {
//       type: String,
//       default: "",
//     },

//     email: {
//       type: String,
//       default: "",
//     },

//     phone: {
//       type: String,
//       default: "",
//     },

//     education: {
//       type: [String],
//       default: [],
//     },

//     skills: {
//       type: [String],
//       default: [],
//     },

//     projects: {
//       type: [String],
//       default: [],
//     },

//     experience: {
//       type: [String],
//       default: [],
//     },

//     strengths: {
//       type: [String],
//       default: [],
//     },

//     weaknesses: {
//       type: [String],
//       default: [],
//     },

//     missingSkills: {
//       type: [String],
//       default: [],
//     },

//     suggestedRole: {
//       type: String,
//       default: "",
//     },

//     recommendations: {
//       type: [String],
//       default: [],
//     },
// },{timestamps:true})


// const Resume = mongoose.model("Resume" , resumeSchema)

// export default Resume