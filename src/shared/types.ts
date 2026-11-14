export const APP_SCHEMA_VERSION = 1;

export type ApprovalStatus = 'pending' | 'approved' | 'skipped';
export type ExecutionStatus = 'idle' | 'queued' | 'sent' | 'failed' | 'blocked' | 'manual_required';
export type JobStage =
  'discovered' | 'resume_rejected' | 'city_rejected' | 'company_rejected' | 'ready_for_review';
export type ReliabilityGrade = 'A' | 'B' | 'C' | 'D';

export interface ScreeningSettings {
  resumeText: string;
  targetTitles: string;
  targetCities: string;
  excludedKeywords: string;
  allowRemote: boolean;
  minimumResumeScore: number;
  minimumCompanyScore: number;
  maxDailyMessages: number;
  sendIntervalSeconds: number;
}

export interface CandidateProfile {
  resumeText: string;
  targetTitles: string[];
  targetCities: string[];
  skills: string[];
  educationLevel: number;
  yearsOfExperience: number;
  highlights: string[];
}

export interface BossJobDraft {
  url: string;
  title: string;
  company: string;
  location: string;
  salary: string;
  tags: string[];
  description: string;
  companySize: string;
  financing: string;
  recruiter: string;
  source: 'list' | 'detail';
}

export interface ResumeMatchResult {
  score: number;
  passed: boolean;
  evidence: string[];
  gaps: string[];
  matchedKeywords: string[];
  rejectionReasons: string[];
}

export interface CityFilterResult {
  passed: boolean;
  score: number;
  normalizedCity: string;
  reason: string;
}

export interface CompanyAssessment {
  score: number;
  grade: ReliabilityGrade;
  passed: boolean;
  positives: string[];
  risks: string[];
  recommendedChecks: string[];
  externalLinks: Array<{
    label: string;
    url: string;
  }>;
}

export interface GreetingOption {
  id: 'match' | 'evidence' | 'question';
  label: string;
  text: string;
}

export interface JobRecord {
  id: string;
  fingerprint: string;
  sourceUrl: string;
  title: string;
  company: string;
  location: string;
  salary: string;
  tags: string[];
  description: string;
  companySize: string;
  financing: string;
  recruiter: string;
  stage: JobStage;
  finalScore: number;
  matchResult: ResumeMatchResult;
  cityResult: CityFilterResult;
  companyAssessment: CompanyAssessment;
  greetingOptions: GreetingOption[];
  recommendedGreetingId: GreetingOption['id'];
  selectedGreeting: string;
  approvalStatus: ApprovalStatus;
  executionStatus: ExecutionStatus;
  rejectionReasons: string[];
  discoveredAt: string;
  updatedAt: string;
  approvedAt: string | null;
}

export interface ExecutionLog {
  id: string;
  jobId: string;
  company: string;
  title: string;
  at: string;
  status: 'sent' | 'failed' | 'blocked' | 'manual_required';
  message: string;
}

export interface AppState {
  schemaVersion: number;
  settings: ScreeningSettings;
  jobs: JobRecord[];
  executionLogs: ExecutionLog[];
  lastScanAt: string | null;
}

export interface BossPageStatus {
  connected: boolean;
  url: string;
  title: string;
  isVerificationPage: boolean;
  message: string;
}

export interface BossScanPayload {
  drafts: BossJobDraft[];
  page: BossPageStatus;
}

export interface BossSendResult {
  status: 'sent' | 'blocked' | 'manual_required' | 'not_found';
  message: string;
}

export type ContentRequest =
  | {
      type: 'BOSS_PAGE_STATUS';
    }
  | {
      type: 'BOSS_SCAN_JOBS';
    }
  | {
      type: 'BOSS_OPEN_JOB';
      url: string;
    }
  | {
      type: 'BOSS_SEND_GREETING';
      url: string;
      text: string;
    };

export type ContentResponse =
  | {
      ok: true;
      status: BossPageStatus;
    }
  | {
      ok: true;
      payload: BossScanPayload;
    }
  | {
      ok: true;
      result: BossSendResult;
    }
  | {
      ok: false;
      error: string;
    };
