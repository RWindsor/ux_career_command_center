import { GoogleGenAI, Type } from "@google/genai";
import {
  JOB_ANALYSIS_SYSTEM_INSTRUCTION,
  buildJobAnalysisPrompt,
  RESUME_EXTRACTION_SYSTEM_INSTRUCTION,
  buildResumeExtractionPrompt,
  MATCH_SCORING_SYSTEM_INSTRUCTION,
  buildMatchScoringPrompt,
  type MatchScoringInput,
  INTERVIEW_PREP_SYSTEM_INSTRUCTION,
  buildInterviewPrepPrompt,
  type InterviewPrepInput,
  WEEKLY_REPORT_SYSTEM_INSTRUCTION,
  buildWeeklyReportPrompt,
  type WeeklyReportInput,
  APPLICATION_PACKAGE_SYSTEM_INSTRUCTION,
  buildApplicationPackagePrompt,
  type ApplicationPackageInput,
  OFFER_PREP_SYSTEM_INSTRUCTION,
  buildOfferPrepPrompt,
  type OfferPrepInput,
} from "@/lib/ai/prompts";
import {
  jobAnalysisSchema,
  resumeExtractionSchema,
  matchScoreSchema,
  interviewPrepSchema,
  weeklyReportSchema,
  applicationPackageSchema,
  offerPrepSchema,
  type JobAnalysisResult,
  type ResumeExtractionResult,
  type MatchScoreResult,
  type InterviewPrepResult,
  type WeeklyReportResult,
  type ApplicationPackageResult,
  type OfferPrepResult,
} from "@/lib/ai/schemas";

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (!client) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not set. Add it to .env.local (see .env.local.example).");
    }
    client = new GoogleGenAI({ apiKey });
  }
  return client;
}

/**
 * Gemini's response schema is a constrained subset of OpenAPI's Schema
 * object — this is what actually shapes the model's output. The zod
 * schema in lib/ai/schemas.ts then re-validates the parsed JSON before
 * it reaches the database, since "constrained" isn't the same as
 * "guaranteed."
 */
const JOB_ANALYSIS_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    summary: {
      type: Type.STRING,
      description: "2-4 neutral sentences summarizing the role for someone deciding whether to apply.",
    },
    seniorityLevel: {
      type: Type.STRING,
      nullable: true,
      description: 'e.g. "Mid", "Senior", "Staff/Principal" — null if not stated or inferable.',
    },
    employmentType: {
      type: Type.STRING,
      nullable: true,
      description: 'e.g. "Full-time", "Contract", "Internship" — null if not stated.',
    },
    yearsOfExperience: {
      type: Type.STRING,
      nullable: true,
      description: 'e.g. "5+ years" — null if not stated.',
    },
    salaryRange: {
      type: Type.STRING,
      nullable: true,
      description: "Verbatim or lightly normalized salary/compensation range — null if not stated.",
    },
    keyResponsibilities: { type: Type.ARRAY, items: { type: Type.STRING } },
    requiredSkills: { type: Type.ARRAY, items: { type: Type.STRING } },
    niceToHaveSkills: { type: Type.ARRAY, items: { type: Type.STRING } },
    keywords: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "8-20 ATS/resume-tailoring keywords: tools, methods, skills, role titles.",
    },
  },
  required: [
    "summary",
    "seniorityLevel",
    "employmentType",
    "yearsOfExperience",
    "salaryRange",
    "keyResponsibilities",
    "requiredSkills",
    "niceToHaveSkills",
    "keywords",
  ],
};

/**
 * Shared plumbing for every "send a prompt, get validated structured
 * JSON back" call. Gemini's responseSchema constrains what the model
 * *can* emit; the zod schema then re-validates what it actually did
 * emit before anything touches the database, since "constrained" isn't
 * the same as "guaranteed."
 */
async function generateStructuredJson<T>(params: {
  systemInstruction: string;
  prompt: string;
  responseSchema: object;
  zodSchema: { safeParse: (data: unknown) => { success: boolean; data?: T; error?: { message: string } } };
}): Promise<{ data: T; model: string; rawResponse: unknown }> {
  const ai = getClient();
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";

  const response = await ai.models.generateContent({
    model,
    contents: params.prompt,
    config: {
      systemInstruction: params.systemInstruction,
      responseMimeType: "application/json",
      responseSchema: params.responseSchema,
      temperature: 0.2,
    },
  });

  const rawText = response.text;
  if (!rawText) {
    throw new Error("Gemini returned an empty response.");
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawText);
  } catch {
    throw new Error("Gemini's response was not valid JSON.");
  }

  const result = params.zodSchema.safeParse(parsedJson);
  if (!result.success || result.data === undefined) {
    throw new Error(`Gemini's response didn't match the expected shape: ${result.error?.message ?? "unknown error"}`);
  }

  return { data: result.data, model, rawResponse: parsedJson };
}

export interface JobAnalysisOutcome {
  analysis: JobAnalysisResult;
  model: string;
  /** Full parsed JSON as returned by Gemini, stored for audit/debugging. */
  rawResponse: unknown;
}

/**
 * Sends a job posting to Gemini and returns a validated, structured
 * extraction: summary, requirements, keywords, etc. Throws on API
 * failure, empty response, invalid JSON, or a schema mismatch — callers
 * (see app/actions/jobs.ts) decide how to surface that to the user.
 */
export async function analyzeJobDescription(jobDescription: string): Promise<JobAnalysisOutcome> {
  const { data, model, rawResponse } = await generateStructuredJson({
    systemInstruction: JOB_ANALYSIS_SYSTEM_INSTRUCTION,
    prompt: buildJobAnalysisPrompt(jobDescription),
    responseSchema: JOB_ANALYSIS_RESPONSE_SCHEMA,
    zodSchema: jobAnalysisSchema,
  });

  return { analysis: data, model, rawResponse };
}

/**
 * Gemini response schema for resume extraction — the structured facts
 * Match Scoring later compares against a job's analysis.
 */
const RESUME_EXTRACTION_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    skills: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Concrete tools, methods, and competencies named or clearly demonstrated in the resume.",
    },
    experienceSummary: {
      type: Type.STRING,
      description: "2-4 neutral sentences describing the candidate's overall background and level.",
    },
    yearsOfExperience: {
      type: Type.STRING,
      nullable: true,
      description: 'e.g. "6 years" — null if not clearly inferable.',
    },
    jobTitlesHeld: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Distinct job titles from the resume, most recent first.",
    },
  },
  required: ["skills", "experienceSummary", "yearsOfExperience", "jobTitlesHeld"],
};

export interface ResumeExtractionOutcome {
  analysis: ResumeExtractionResult;
  model: string;
  rawResponse: unknown;
}

/**
 * Sends resume text to Gemini and returns validated structured data:
 * skills, experience summary, years of experience, job titles held.
 */
export async function extractResumeData(resumeText: string): Promise<ResumeExtractionOutcome> {
  const { data, model, rawResponse } = await generateStructuredJson({
    systemInstruction: RESUME_EXTRACTION_SYSTEM_INSTRUCTION,
    prompt: buildResumeExtractionPrompt(resumeText),
    responseSchema: RESUME_EXTRACTION_RESPONSE_SCHEMA,
    zodSchema: resumeExtractionSchema,
  });

  return { analysis: data, model, rawResponse };
}

/**
 * Gemini response schema for match scoring.
 */
const MATCH_SCORE_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    score: {
      type: Type.INTEGER,
      description: "0-100 fit score. Be specific and honest rather than generous.",
    },
    strengths: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Concrete overlaps between the resume and the job's requirements.",
    },
    gaps: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Concrete job requirements the resume doesn't evidence. Empty array if none.",
    },
    recommendations: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "2-5 specific, actionable suggestions for tailoring this resume/application to this job.",
    },
  },
  required: ["score", "strengths", "gaps", "recommendations"],
};

export interface MatchScoreOutcome {
  match: MatchScoreResult;
  model: string;
  rawResponse: unknown;
}

/**
 * Scores a resume's extracted data against a job's extracted analysis.
 * Both sides must already have a Gemini extraction on file — this
 * function only does the comparison, it doesn't run either extraction.
 */
export async function scoreMatch(input: MatchScoringInput): Promise<MatchScoreOutcome> {
  const { data, model, rawResponse } = await generateStructuredJson({
    systemInstruction: MATCH_SCORING_SYSTEM_INSTRUCTION,
    prompt: buildMatchScoringPrompt(input),
    responseSchema: MATCH_SCORE_RESPONSE_SCHEMA,
    zodSchema: matchScoreSchema,
  });

  return { match: data, model, rawResponse };
}

/**
 * Gemini response schema for the Phase 5 interview prep pack.
 */
const INTERVIEW_PREP_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    companyResearch: {
      type: Type.STRING,
      description: "General, non-fabricated guidance on what this kind of company likely values and how to research it.",
    },
    interviewQuestions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          category: { type: Type.STRING },
          question: { type: Type.STRING },
        },
        required: ["category", "question"],
      },
    },
    starStories: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          question: { type: Type.STRING },
          suggestedStory: { type: Type.STRING },
          resumeEvidence: { type: Type.STRING },
        },
        required: ["question", "suggestedStory", "resumeEvidence"],
      },
    },
    portfolioRecommendations: { type: Type.ARRAY, items: { type: Type.STRING } },
    recruiterScreenPrep: { type: Type.ARRAY, items: { type: Type.STRING } },
    hiringManagerPrep: { type: Type.ARRAY, items: { type: Type.STRING } },
    portfolioPresentationPrep: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: [
    "companyResearch",
    "interviewQuestions",
    "starStories",
    "portfolioRecommendations",
    "recruiterScreenPrep",
    "hiringManagerPrep",
    "portfolioPresentationPrep",
  ],
};

export interface InterviewPrepOutcome {
  prep: InterviewPrepResult;
  model: string;
  rawResponse: unknown;
}

/**
 * Generates a full interview prep pack for a job, optionally grounded
 * in a specific resume's extraction. See app/actions/interview-prep.ts
 * for the caller that assembles `input` from the database.
 */
export async function generateInterviewPrep(input: InterviewPrepInput): Promise<InterviewPrepOutcome> {
  const { data, model, rawResponse } = await generateStructuredJson({
    systemInstruction: INTERVIEW_PREP_SYSTEM_INSTRUCTION,
    prompt: buildInterviewPrepPrompt(input),
    responseSchema: INTERVIEW_PREP_RESPONSE_SCHEMA,
    zodSchema: interviewPrepSchema,
  });

  return { prep: data, model, rawResponse };
}

/**
 * Gemini response schema for the Phase 7 weekly report narrative.
 * The numeric stats are computed separately (app/actions/reports.ts);
 * this only covers the text Gemini writes about them.
 */
const WEEKLY_REPORT_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    summary: { type: Type.STRING },
    recommendations: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ["summary", "recommendations"],
};

export interface WeeklyReportOutcome {
  report: WeeklyReportResult;
  model: string;
  rawResponse: unknown;
}

export async function generateWeeklyReportNarrative(input: WeeklyReportInput): Promise<WeeklyReportOutcome> {
  const { data, model, rawResponse } = await generateStructuredJson({
    systemInstruction: WEEKLY_REPORT_SYSTEM_INSTRUCTION,
    prompt: buildWeeklyReportPrompt(input),
    responseSchema: WEEKLY_REPORT_RESPONSE_SCHEMA,
    zodSchema: weeklyReportSchema,
  });

  return { report: data, model, rawResponse };
}

/**
 * Gemini response schema for the AI Application Assistant package.
 */
const APPLICATION_PACKAGE_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    keywordGapAnalysis: { type: Type.ARRAY, items: { type: Type.STRING } },
    resumeTailoringRecommendations: { type: Type.ARRAY, items: { type: Type.STRING } },
    experienceToForeground: { type: Type.ARRAY, items: { type: Type.STRING } },
    applicationStrategyNotes: { type: Type.STRING },
    coverLetterDraft: { type: Type.STRING },
    recruiterOutreachMessage: { type: Type.STRING },
  },
  required: [
    "keywordGapAnalysis",
    "resumeTailoringRecommendations",
    "experienceToForeground",
    "applicationStrategyNotes",
    "coverLetterDraft",
    "recruiterOutreachMessage",
  ],
};

export interface ApplicationPackageOutcome {
  package: ApplicationPackageResult;
  model: string;
  rawResponse: unknown;
}

/**
 * Generates a full application package (keyword gaps, tailoring
 * recommendations, cover letter, outreach message) for a (job, resume)
 * pair. See app/actions/application-package.ts for the caller that
 * assembles `input` from the database.
 */
export async function generateApplicationPackage(input: ApplicationPackageInput): Promise<ApplicationPackageOutcome> {
  const { data, model, rawResponse } = await generateStructuredJson({
    systemInstruction: APPLICATION_PACKAGE_SYSTEM_INSTRUCTION,
    prompt: buildApplicationPackagePrompt(input),
    responseSchema: APPLICATION_PACKAGE_RESPONSE_SCHEMA,
    zodSchema: applicationPackageSchema,
  });

  return { package: data, model, rawResponse };
}

/**
 * Gemini response schema for the Offer/Negotiation/Onboarding pack.
 */
const OFFER_PREP_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    offerEvaluationChecklist: { type: Type.ARRAY, items: { type: Type.STRING } },
    negotiationGuide: { type: Type.STRING },
    questionsToAskBeforeAccepting: { type: Type.ARRAY, items: { type: Type.STRING } },
    negotiationTalkingPoints: { type: Type.ARRAY, items: { type: Type.STRING } },
    onboardingPlan30: { type: Type.ARRAY, items: { type: Type.STRING } },
    onboardingPlan60: { type: Type.ARRAY, items: { type: Type.STRING } },
    onboardingPlan90: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: [
    "offerEvaluationChecklist",
    "negotiationGuide",
    "questionsToAskBeforeAccepting",
    "negotiationTalkingPoints",
    "onboardingPlan30",
    "onboardingPlan60",
    "onboardingPlan90",
  ],
};

export interface OfferPrepOutcome {
  prep: OfferPrepResult;
  model: string;
  rawResponse: unknown;
}

/**
 * Generates the offer-evaluation, negotiation, and onboarding pack for
 * a job at the Offer stage. Never fabricates compensation data — see
 * the system instruction in lib/ai/prompts.ts.
 */
export async function generateOfferPrep(input: OfferPrepInput): Promise<OfferPrepOutcome> {
  const { data, model, rawResponse } = await generateStructuredJson({
    systemInstruction: OFFER_PREP_SYSTEM_INSTRUCTION,
    prompt: buildOfferPrepPrompt(input),
    responseSchema: OFFER_PREP_RESPONSE_SCHEMA,
    zodSchema: offerPrepSchema,
  });

  return { prep: data, model, rawResponse };
}
