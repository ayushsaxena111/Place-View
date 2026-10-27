import {Annotation} from "@langchain/langgraph"

export const RoadmapState = Annotation.Root({

  role: Annotation,

  targetPackage: Annotation,

  useResume: Annotation,

  resume: Annotation,

  // New: time available and interview-based personalisation
  durationWeeks: Annotation,

  hoursPerWeek: Annotation,

  insights: Annotation,

  roadmap: Annotation,

})
