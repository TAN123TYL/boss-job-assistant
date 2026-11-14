import { matchCity } from './city';
import { assessCompany } from './company';
import { generateGreetings } from './greeting';
import { scoreResumeMatch } from './matching';
import type { BossJobDraft, CandidateProfile, JobRecord, ScreeningSettings } from './types';
import { clamp, hashString, unique } from './utils';

function createJobFingerprint(draft: BossJobDraft): string {
  return hashString(
    [draft.url, draft.title, draft.company, draft.location]
      .map((value) => value.trim().toLocaleLowerCase('zh-CN'))
      .join('|'),
  );
}

export function screenJob(
  draft: BossJobDraft,
  profile: CandidateProfile,
  settings: ScreeningSettings,
  timestamp = new Date().toISOString(),
): JobRecord {
  const fingerprint = createJobFingerprint(draft);
  const id = hashString(draft.url || fingerprint);
  const matchResult = scoreResumeMatch(draft, profile, settings);

  if (!matchResult.passed) {
    return createRejectedRecord({
      id,
      fingerprint,
      draft,
      timestamp,
      stage: 'resume_rejected',
      matchResult,
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
      cityResult,
      companyAssessment,
      rejectionReasons: [
        `公司信号分 ${companyAssessment.score} 低于阈值 ${settings.minimumCompanyScore}`,
      ],
    });
  }

  const greetings = generateGreetings(draft, profile, matchResult);
  const recommended =
    greetings.options.find((option) => option.id === greetings.recommendedId) ??
    greetings.options[0];
  const finalScore = Math.round(
    clamp(
      matchResult.score * 0.6 + companyAssessment.score * 0.25 + cityResult.score * 0.15,
      0,
      100,
    ),
  );

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
    stage: 'ready_for_review',
    finalScore,
    matchResult,
    cityResult,
    companyAssessment,
    greetingOptions: greetings.options,
    recommendedGreetingId: greetings.recommendedId,
    selectedGreeting: recommended?.text ?? '',
    approvalStatus: 'pending',
    executionStatus: 'idle',
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
    stage: input.stage,
    finalScore: 0,
    matchResult: input.matchResult,
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
    rejectionReasons: unique(input.rejectionReasons),
    discoveredAt: input.timestamp,
    updatedAt: input.timestamp,
    approvedAt: null,
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
        selectedGreeting: existing.selectedGreeting || job.selectedGreeting,
        approvedAt: existing.approvedAt,
        discoveredAt: existing.discoveredAt,
      };
    }

    if (existing.approvalStatus === 'approved' || existing.approvalStatus === 'skipped') {
      return {
        ...job,
        approvalStatus: existing.approvalStatus,
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
