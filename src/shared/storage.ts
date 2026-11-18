import { browser } from 'wxt/browser';
import {
  createDefaultState,
  createEmptyResume,
  DEFAULT_SETTINGS,
  DEFAULT_RESUME_SLOT_COUNT,
  MAXIMUM_RESUME_COUNT,
} from './defaults';
import { APP_SCHEMA_VERSION } from './types';
import type {
  AppState,
  CompanyAssessment,
  JobRecord,
  ResumeDocument,
  ScreeningSettings,
} from './types';

const STORAGE_KEY = 'boss-job-assistant:state:v7';
const STORAGE_READ_TIMEOUT_MS = 3_000;
const LEGACY_STORAGE_KEYS = [
  'boss-job-assistant:state:v6',
  'boss-job-assistant:state:v5',
  'boss-job-assistant:state:v4',
  'boss-job-assistant:state:v3',
  'boss-job-assistant:state:v2',
  'boss-job-assistant:state:v1',
] as const;

interface CompactionLimits {
  maximumJobs: number;
  descriptionLength: number;
  companyTextLength: number;
  maximumLogs: number;
  evidenceLength: number;
}

const COMPACTION_LIMITS: Record<1 | 2 | 3, CompactionLimits> = {
  1: {
    maximumJobs: 250,
    descriptionLength: 8_000,
    companyTextLength: 3_000,
    maximumLogs: 300,
    evidenceLength: 800,
  },
  2: {
    maximumJobs: 120,
    descriptionLength: 4_000,
    companyTextLength: 1_200,
    maximumLogs: 100,
    evidenceLength: 500,
  },
  3: {
    maximumJobs: 60,
    descriptionLength: 1_500,
    companyTextLength: 500,
    maximumLogs: 30,
    evidenceLength: 300,
  },
};

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error('读取本地数据超时，请关闭并重新打开侧边栏')),
      timeoutMs,
    );
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function migrateResume(value: unknown, index: number): ResumeDocument {
  const resume = objectValue(value);
  const fileName = typeof resume.fileName === 'string' ? resume.fileName : '';
  const fallbackName = fileName.replace(/\.[^.]+$/u, '').trim() || `简历 ${index + 1}`;
  return createEmptyResume(index, {
    id: typeof resume.id === 'string' && resume.id.trim() ? resume.id : `resume-${index + 1}`,
    name: typeof resume.name === 'string' && resume.name.trim() ? resume.name.trim() : fallbackName,
    text: typeof resume.text === 'string' ? resume.text : '',
    fileName,
    updatedAt: typeof resume.updatedAt === 'string' ? resume.updatedAt : '',
  });
}

function migrateResumes(value: unknown, legacyResumeText: unknown): ResumeDocument[] {
  const resumes = Array.isArray(value)
    ? value.slice(0, MAXIMUM_RESUME_COUNT).map(migrateResume)
    : [];
  const uniqueResumes: ResumeDocument[] = [];
  const ids = new Set<string>();

  for (const resume of resumes) {
    if (ids.has(resume.id)) {
      resume.id = `resume-${uniqueResumes.length + 1}`;
    }
    ids.add(resume.id);
    uniqueResumes.push(resume);
  }

  if (
    uniqueResumes.length === 0 &&
    typeof legacyResumeText === 'string' &&
    legacyResumeText.trim()
  ) {
    uniqueResumes.push(
      createEmptyResume(0, {
        name: '主简历',
        text: legacyResumeText,
      }),
    );
  }

  while (uniqueResumes.length < DEFAULT_RESUME_SLOT_COUNT) {
    uniqueResumes.push(createEmptyResume(uniqueResumes.length));
  }

  return uniqueResumes;
}

function migrateSettings(value: unknown): ScreeningSettings {
  const legacySettings = { ...objectValue(value) };
  legacySettings.resumes = migrateResumes(legacySettings.resumes, legacySettings.resumeText);
  delete legacySettings.resumeText;
  delete legacySettings.maxDailyMessages;
  delete legacySettings.sendIntervalSeconds;
  return {
    ...DEFAULT_SETTINGS,
    ...legacySettings,
  } as ScreeningSettings;
}

function defaultCompanyAssessment(): CompanyAssessment {
  return {
    score: 0,
    grade: 'D',
    passed: false,
    source: 'page_signals',
    trustDecision: 'unverified',
    aiSummary: '',
    aiEvidence: [],
    researchedAt: null,
    positives: [],
    risks: [],
    recommendedChecks: [],
    externalLinks: [],
  };
}

function migrateCompanyAssessment(value: unknown): CompanyAssessment {
  const assessment = objectValue(value);
  const grade = ['A', 'B', 'C', 'D'].includes(String(assessment.grade))
    ? (assessment.grade as CompanyAssessment['grade'])
    : 'D';

  return {
    ...defaultCompanyAssessment(),
    ...assessment,
    grade,
    source: assessment.source === 'ai_web_verified' ? 'ai_web_verified' : 'page_signals',
    trustDecision:
      assessment.trustDecision === 'trusted' ||
      assessment.trustDecision === 'review' ||
      assessment.trustDecision === 'risky'
        ? assessment.trustDecision
        : 'unverified',
    aiEvidence: Array.isArray(assessment.aiEvidence) ? assessment.aiEvidence : [],
    positives: Array.isArray(assessment.positives) ? assessment.positives : [],
    risks: Array.isArray(assessment.risks) ? assessment.risks : [],
    recommendedChecks: Array.isArray(assessment.recommendedChecks)
      ? assessment.recommendedChecks
      : [],
    externalLinks: Array.isArray(assessment.externalLinks) ? assessment.externalLinks : [],
  } as CompanyAssessment;
}

function migrateJob(value: unknown): JobRecord {
  const job = objectValue(value);
  const matchedResumeId = typeof job.matchedResumeId === 'string' ? job.matchedResumeId : undefined;
  const matchedResumeName =
    typeof job.matchedResumeName === 'string' ? job.matchedResumeName : undefined;
  const resumeMatches = Array.isArray(job.resumeMatches)
    ? job.resumeMatches
        .filter((item) => item && typeof item === 'object')
        .map((item) => {
          const summary = objectValue(item);
          return {
            resumeId: typeof summary.resumeId === 'string' ? summary.resumeId : '',
            resumeName: typeof summary.resumeName === 'string' ? summary.resumeName : '',
            score: Number.isFinite(Number(summary.score)) ? Number(summary.score) : 0,
            passed: summary.passed === true,
          };
        })
    : [];
  return {
    ...job,
    ...(matchedResumeId ? { matchedResumeId } : {}),
    ...(matchedResumeName ? { matchedResumeName } : {}),
    resumeMatches,
    companyPageText: typeof job.companyPageText === 'string' ? job.companyPageText : '',
    companyAssessment: migrateCompanyAssessment(job.companyAssessment),
    aiReview: job.aiReview && typeof job.aiReview === 'object' ? job.aiReview : null,
    executionStatus:
      job.executionStatus === 'sent' ||
      job.executionStatus === 'failed' ||
      job.executionStatus === 'blocked' ||
      job.executionStatus === 'manual_required' ||
      job.executionStatus === 'queued' ||
      job.executionStatus === 'sending'
        ? job.executionStatus
        : 'idle',
    queueError: typeof job.queueError === 'string' ? job.queueError : '',
    lastAttemptAt: typeof job.lastAttemptAt === 'string' ? job.lastAttemptAt : null,
  } as JobRecord;
}

export function migrateAppState(value: unknown): AppState {
  const state = objectValue(value);
  const settings = migrateSettings(state.settings);
  if (Number(state.schemaVersion ?? 1) < 3 && settings.minimumResumeScore === 65) {
    settings.minimumResumeScore = 70;
  }
  const jobs = Array.isArray(state.jobs) ? state.jobs.map(migrateJob) : [];
  const executionLogs = Array.isArray(state.executionLogs) ? state.executionLogs : [];

  return {
    schemaVersion: APP_SCHEMA_VERSION,
    settings,
    jobs,
    executionLogs,
    lastScanAt: typeof state.lastScanAt === 'string' ? state.lastScanAt : null,
  } as AppState;
}

function hasStateShape(value: unknown): boolean {
  const state = objectValue(value);
  return Boolean(state.settings) && Array.isArray(state.jobs) && Array.isArray(state.executionLogs);
}

function limitText(value: string, maximumLength: number): string {
  return value.length <= maximumLength ? value : `${value.slice(0, maximumLength - 1)}…`;
}

function isPriorityJob(job: JobRecord): boolean {
  return (
    job.approvalStatus === 'approved' ||
    job.stage === 'ready_for_review' ||
    job.executionStatus === 'queued' ||
    job.executionStatus === 'sending' ||
    job.executionStatus === 'failed' ||
    job.executionStatus === 'blocked' ||
    job.executionStatus === 'manual_required'
  );
}

function selectJobsForStorage(jobs: JobRecord[], maximumJobs: number): JobRecord[] {
  if (jobs.length <= maximumJobs) {
    return jobs;
  }

  const selectedIds = new Set(jobs.filter(isPriorityJob).map((job) => job.id));
  const optionalJobs = jobs
    .filter((job) => !selectedIds.has(job.id))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

  for (const job of optionalJobs) {
    if (selectedIds.size >= maximumJobs) {
      break;
    }
    selectedIds.add(job.id);
  }

  return jobs.filter((job) => selectedIds.has(job.id));
}

export function compactAppStateForStorage(state: AppState, level: 1 | 2 | 3): AppState {
  const limits = COMPACTION_LIMITS[level];
  const selectedJobs = selectJobsForStorage(state.jobs, limits.maximumJobs);
  const jobs = selectedJobs.map((job) => ({
    ...job,
    resumeMatches: job.resumeMatches?.slice(0, MAXIMUM_RESUME_COUNT) ?? [],
    tags: job.tags.slice(0, 20),
    description: limitText(job.description, limits.descriptionLength),
    companyPageText: limitText(job.companyPageText, limits.companyTextLength),
    recruiter: limitText(job.recruiter, 200),
    queueError: limitText(job.queueError, 1_000),
    selectedGreeting: limitText(job.selectedGreeting, 600),
    greetingOptions: job.greetingOptions.slice(0, 6).map((option) => ({
      ...option,
      text: limitText(option.text, 600),
    })),
    matchResult: {
      ...job.matchResult,
      evidence: job.matchResult.evidence.slice(0, 20).map((item) => limitText(item, 500)),
      gaps: job.matchResult.gaps.slice(0, 20).map((item) => limitText(item, 500)),
      matchedKeywords: job.matchResult.matchedKeywords.slice(0, 50),
      rejectionReasons: job.matchResult.rejectionReasons.slice(0, 20),
    },
    companyAssessment: {
      ...job.companyAssessment,
      aiSummary: limitText(job.companyAssessment.aiSummary, 1_500),
      aiEvidence: job.companyAssessment.aiEvidence.slice(0, 12).map((evidence) => ({
        ...evidence,
        snippet: limitText(evidence.snippet, limits.evidenceLength),
      })),
      positives: job.companyAssessment.positives.slice(0, 20),
      risks: job.companyAssessment.risks.slice(0, 20),
      recommendedChecks: job.companyAssessment.recommendedChecks.slice(0, 20),
      externalLinks: job.companyAssessment.externalLinks.slice(0, 12),
    },
    aiReview: job.aiReview
      ? {
          ...job.aiReview,
          summary: limitText(job.aiReview.summary, 1_500),
          evidence: job.aiReview.evidence.slice(0, 20).map((item) => limitText(item, 500)),
          concerns: job.aiReview.concerns.slice(0, 20).map((item) => limitText(item, 500)),
          greetingOptions: job.aiReview.greetingOptions.slice(0, 6).map((option) => ({
            ...option,
            text: limitText(option.text, 600),
          })),
        }
      : null,
    rejectionReasons: job.rejectionReasons.slice(0, 20),
  }));
  const executionLogs = state.executionLogs
    .slice(-limits.maximumLogs)
    .map((log) => ({ ...log, message: limitText(log.message, 500) }));

  return {
    ...state,
    jobs,
    executionLogs,
  };
}

export function isStorageQuotaError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /kQuotaBytes|QUOTA_BYTES|quota exceeded|quota.*exceeded/iu.test(message);
}

async function removeLegacyStorageKeys(): Promise<void> {
  await browser.storage.local.remove([...LEGACY_STORAGE_KEYS]).catch((error: unknown) => {
    console.warn('Unable to remove legacy Boss assistant state keys', error);
  });
}

export async function loadAppState(): Promise<AppState> {
  const stored = await withTimeout(
    browser.storage.local.get([STORAGE_KEY, ...LEGACY_STORAGE_KEYS]),
    STORAGE_READ_TIMEOUT_MS,
  );
  let migrationError: unknown;

  for (const key of [STORAGE_KEY, ...LEGACY_STORAGE_KEYS]) {
    const candidate = stored[key];
    if (!candidate || !hasStateShape(candidate)) {
      continue;
    }

    try {
      const migrated = migrateAppState(candidate);
      if (key !== STORAGE_KEY) {
        await saveAppState(migrated).catch((error: unknown) => {
          console.warn('Unable to persist migrated Boss assistant state', error);
        });
      } else {
        await removeLegacyStorageKeys();
      }
      return migrated;
    } catch (error) {
      migrationError = error;
      console.warn(`Unable to migrate Boss assistant state from ${key}`, error);
    }
  }

  if (migrationError) {
    throw new Error('本地保存的数据无法迁移，请使用备份恢复或重新保存筛选方案', {
      cause: migrationError,
    });
  }

  return createDefaultState();
}

export async function saveAppState(state: AppState): Promise<void> {
  try {
    await browser.storage.local.set({ [STORAGE_KEY]: state });
    await removeLegacyStorageKeys();
    return;
  } catch (error) {
    if (!isStorageQuotaError(error)) {
      throw error;
    }
    console.warn('Boss assistant state exceeded storage quota; retrying with compaction');
  }

  await removeLegacyStorageKeys();
  let lastError: unknown;

  for (const level of [1, 2, 3] as const) {
    try {
      await browser.storage.local.set({
        [STORAGE_KEY]: compactAppStateForStorage(state, level),
      });
      console.warn(`Boss assistant state saved with compaction level ${level}`);
      return;
    } catch (error) {
      lastError = error;
      if (!isStorageQuotaError(error)) {
        throw error;
      }
    }
  }

  throw new Error('Chrome 本地存储空间仍然不足，已压缩历史数据但无法保存', {
    cause: lastError,
  });
}
