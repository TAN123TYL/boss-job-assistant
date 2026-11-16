import { browser } from 'wxt/browser';
import { createDefaultState, DEFAULT_SETTINGS } from './defaults';
import { APP_SCHEMA_VERSION } from './types';
import type { AppState, CompanyAssessment, JobRecord, ScreeningSettings } from './types';

const STORAGE_KEY = 'boss-job-assistant:state:v6';
const STORAGE_READ_TIMEOUT_MS = 3_000;
const LEGACY_STORAGE_KEYS = [
  'boss-job-assistant:state:v5',
  'boss-job-assistant:state:v4',
  'boss-job-assistant:state:v3',
  'boss-job-assistant:state:v2',
  'boss-job-assistant:state:v1',
] as const;

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

function migrateSettings(value: unknown): ScreeningSettings {
  const legacySettings = { ...objectValue(value) };
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
  return {
    ...job,
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
        await browser.storage.local.set({ [STORAGE_KEY]: migrated }).catch((error: unknown) => {
          console.warn('Unable to persist migrated Boss assistant state', error);
        });
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
  await browser.storage.local.set({ [STORAGE_KEY]: state });
}
