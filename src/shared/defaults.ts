import { APP_SCHEMA_VERSION } from './types';
import type { AppState, ResumeDocument, ScreeningSettings } from './types';

export const DEFAULT_RESUME_SLOT_COUNT = 3;
export const MINIMUM_ACTIVE_RESUME_COUNT = 1;
export const MAXIMUM_RESUME_COUNT = 10;

export function createEmptyResume(
  index: number,
  overrides: Partial<ResumeDocument> = {},
): ResumeDocument {
  return {
    id: `resume-${index + 1}`,
    name: `简历 ${index + 1}`,
    text: '',
    fileName: '',
    updatedAt: '',
    ...overrides,
  };
}

function createDefaultResumes(): ResumeDocument[] {
  return Array.from({ length: DEFAULT_RESUME_SLOT_COUNT }, (_, index) => createEmptyResume(index));
}

export const DEFAULT_SETTINGS: ScreeningSettings = {
  resumes: createDefaultResumes(),
  targetTitles: '',
  targetCities: '',
  excludedKeywords: '外包,劳务派遣,销售,保险,币圈',
  allowRemote: true,
  minimumResumeScore: 70,
  minimumCompanyScore: 55,
  maxScanPages: 5,
  hydrateJobDetails: true,
  maxJobDetails: 30,
  aiEnabled: false,
  aiEndpoint: 'https://api.deepseek.com/v1',
  aiApiKey: '',
  aiModel: 'deepseek-chat',
  companyResearchEnabled: false,
  tavilyApiKey: '',
  companyTrustThreshold: 70,
  replyNotificationsEnabled: true,
  weeklyAvailabilityDays: 4,
  internshipDuration: '3-6个月',
  growthDirection: 'Java/Vue前后端开发',
  mentionAiToolsInGreeting: true,
};

export function createDefaultState(): AppState {
  return {
    schemaVersion: APP_SCHEMA_VERSION,
    settings: {
      ...DEFAULT_SETTINGS,
      resumes: DEFAULT_SETTINGS.resumes.map((resume) => ({ ...resume })),
    },
    jobs: [],
    executionLogs: [],
    lastScanAt: null,
  };
}
