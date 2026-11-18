import { matchCity } from './city';
import { assessCompany } from './company';
import { generateGreetings } from './greeting';
import { selectBestResumeMatch } from './matching';
import { calculateRankingScore } from './scoring';
import type { BossJobDraft, CandidateProfile, JobRecord, ScreeningSettings } from './types';
import { hashString, unique } from './utils';

export function canonicalJobUrl(url: string): string {
  const jobId = url.match(/\/job_detail\/([^/?#]+)/u)?.[1];
  return jobId ? `job:${jobId.toLocaleLowerCase('zh-CN')}` : url.trim();
}

export function createJobFingerprint(draft: BossJobDraft): string {
  const identity = canonicalJobUrl(draft.url);
  return hashString(
    identity ||
      [draft.title, draft.company, draft.location]
        .map((value) => value.trim().toLocaleLowerCase('zh-CN'))
        .join('|'),
  );
}

export function screenJob(
  draft: BossJobDraft,
  profiles: CandidateProfile[],
  settings: ScreeningSettings,
  timestamp = new Date().toISOString(),
): JobRecord {
  const fingerprint = createJobFingerprint(draft);
  const id = hashString(draft.url || fingerprint);
  const bestResume = selectBestResumeMatch(draft, profiles, settings);
  const { profile, matchResult } = bestResume;

  if (!matchResult.passed) {
    return createRejectedRecord({
      id,
      fingerprint,
      draft,
      timestamp,
      stage: 'resume_rejected',
      matchResult,
      matchedResumeId: profile.resumeId,
      matchedResumeName: profile.resumeName,
      resumeMatches: bestResume.summaries,
      rejectionReasons: matchResult.rejectionReasons,
    });
  }

  const cityResult = matchCity(draft.location, settings.targetCities, settings.allowRemote);

  if (!cityResult.passed) {
    return createRejectedRecord({
      id,
      fingerprint,
      draft,
      timestamp,
      stage: 'city_rejected',
      matchResult,
      matchedResumeId: profile.resumeId,
      matchedResumeName: profile.resumeName,
      resumeMatches: bestResume.summaries,
      cityResult,
      rejectionReasons: [cityResult.reason],
    });
  }

  const companyAssessment = assessCompany(draft, settings.minimumCompanyScore);

  if (!companyAssessment.passed) {
    return createRejectedRecord({
      id,
      fingerprint,
      draft,
      timestamp,
      stage: 'company_rejected',
      matchResult,
      matchedResumeId: profile.resumeId,
      matchedResumeName: profile.resumeName,
      resumeMatches: bestResume.summaries,
      cityResult,
      companyAssessment,
      rejectionReasons: [
        `公司信号分 ${companyAssessment.score} 低于阈值 ${settings.minimumCompanyScore}`,
      ],
    });
  }

  const greetings = generateGreetings(draft, profile, matchResult, settings);
  const recommended =
    greetings.options.find((option) => option.id === greetings.recommendedId) ??
    greetings.options[0];
  const finalScore = calculateRankingScore({
    resumeScore: matchResult.score,
    companyScore: companyAssessment.score,
    cityScore: cityResult.score,
  });

  return {
    id,
    fingerprint,
    sourceUrl: draft.url,
    title: draft.title,
    company: draft.company,
    location: draft.location,
    salary: draft.salary,
    tags: unique(draft.tags),
    description: draft.description,
    companySize: draft.companySize,
    financing: draft.financing,
    recruiter: draft.recruiter,
    companyPageText: draft.companyPageText ?? '',
    stage: 'ready_for_review',
    finalScore,
    matchResult,
    ...(profile.resumeId ? { matchedResumeId: profile.resumeId } : {}),
    ...(profile.resumeName ? { matchedResumeName: profile.resumeName } : {}),
    resumeMatches: bestResume.summaries,
    cityResult,
    companyAssessment,
    aiReview: null,
    greetingOptions: greetings.options,
    recommendedGreetingId: greetings.recommendedId,
    selectedGreeting: recommended?.text ?? '',
    approvalStatus: 'pending',
    executionStatus: 'idle',
    queueError: '',
    lastAttemptAt: null,
    rejectionReasons: [],
    discoveredAt: timestamp,
    updatedAt: timestamp,
    approvedAt: null,
  };
}

interface RejectedRecordInput {
  id: string;
  fingerprint: string;
  draft: BossJobDraft;
  timestamp: string;
  stage: JobRecord['stage'];
  matchResult: JobRecord['matchResult'];
  matchedResumeId: string;
  matchedResumeName: string;
  resumeMatches: NonNullable<JobRecord['resumeMatches']>;
  cityResult?: JobRecord['cityResult'];
  companyAssessment?: JobRecord['companyAssessment'];
  rejectionReasons: string[];
}

function createRejectedRecord(input: RejectedRecordInput): JobRecord {
  return {
    id: input.id,
    fingerprint: input.fingerprint,
    sourceUrl: input.draft.url,
    title: input.draft.title,
    company: input.draft.company,
    location: input.draft.location,
    salary: input.draft.salary,
    tags: unique(input.draft.tags),
    description: input.draft.description,
    companySize: input.draft.companySize,
    financing: input.draft.financing,
    recruiter: input.draft.recruiter,
    companyPageText: input.draft.companyPageText ?? '',
    stage: input.stage,
    finalScore: 0,
    matchResult: input.matchResult,
    ...(input.matchedResumeId ? { matchedResumeId: input.matchedResumeId } : {}),
    ...(input.matchedResumeName ? { matchedResumeName: input.matchedResumeName } : {}),
    resumeMatches: input.resumeMatches,
    cityResult: input.cityResult ?? {
      passed: false,
      score: 0,
      normalizedCity: '',
      reason: '未进入城市筛选',
    },
    companyAssessment: input.companyAssessment ?? {
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
    },
    greetingOptions: [],
    recommendedGreetingId: 'match',
    selectedGreeting: '',
    approvalStatus: 'pending',
    executionStatus: 'idle',
    queueError: '',
    lastAttemptAt: null,
    rejectionReasons: unique(input.rejectionReasons),
    discoveredAt: input.timestamp,
    updatedAt: input.timestamp,
    approvedAt: null,
    aiReview: null,
  };
}

export function mergeScreenedJobs(
  existingJobs: JobRecord[],
  screenedJobs: JobRecord[],
): JobRecord[] {
  const existingByFingerprint = new Map(existingJobs.map((job) => [job.fingerprint, job]));
  const screenedFingerprints = new Set(screenedJobs.map((job) => job.fingerprint));

  const mergedScreened = screenedJobs.map((job) => {
    const existing = existingByFingerprint.get(job.fingerprint);

    if (!existing) {
      return job;
    }

    if (existing.executionStatus === 'sent') {
      return {
        ...job,
        approvalStatus: 'approved' as const,
        executionStatus: 'sent' as const,
        queueError: '',
        selectedGreeting: existing.selectedGreeting || job.selectedGreeting,
        approvedAt: existing.approvedAt,
        discoveredAt: existing.discoveredAt,
      };
    }

    if (existing.approvalStatus === 'approved' || existing.approvalStatus === 'skipped') {
      return {
        ...job,
        approvalStatus: existing.approvalStatus,
        executionStatus: existing.executionStatus,
        queueError: existing.queueError,
        lastAttemptAt: existing.lastAttemptAt,
        selectedGreeting: existing.selectedGreeting || job.selectedGreeting,
        approvedAt: existing.approvedAt,
        discoveredAt: existing.discoveredAt,
      };
    }

    return {
      ...job,
      discoveredAt: existing.discoveredAt,
    };
  });

  return [
    ...existingJobs.filter((job) => !screenedFingerprints.has(job.fingerprint)),
    ...mergedScreened,
  ];
}

const REEVALUATABLE_STAGES = new Set<JobRecord['stage']>([
  'resume_rejected',
  'city_rejected',
  'company_rejected',
  'ai_rejected',
]);

export function canReevaluateRejectedJob(job: JobRecord): boolean {
  return (
    REEVALUATABLE_STAGES.has(job.stage) &&
    job.approvalStatus === 'pending' &&
    job.executionStatus !== 'sent'
  );
}

export function jobRecordToDraft(job: JobRecord): BossJobDraft {
  return {
    url: job.sourceUrl,
    title: job.title,
    company: job.company,
    location: job.location,
    salary: job.salary,
    tags: job.tags,
    description: job.description,
    companySize: job.companySize,
    financing: job.financing,
    recruiter: job.recruiter,
    companyPageText: job.companyPageText,
    source: job.description ? 'detail' : 'list',
  };
}

export function reevaluateStoredJob(
  job: JobRecord,
  profiles: CandidateProfile[],
  settings: ScreeningSettings,
  timestamp = new Date().toISOString(),
): JobRecord {
  const reevaluated = screenJob(jobRecordToDraft(job), profiles, settings, timestamp);
  return {
    ...reevaluated,
    discoveredAt: job.discoveredAt,
  };
}
