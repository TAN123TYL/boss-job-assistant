import { describe, expect, it } from 'vitest';
import { approvedQueue, canExecuteQueue, isApprovedForQueue } from './approval';
import type { JobRecord } from './types';

function createJob(overrides: Partial<JobRecord> = {}): JobRecord {
  return {
    id: 'job-1',
    fingerprint: 'fingerprint-1',
    sourceUrl: 'https://www.zhipin.com/job_detail/example.html',
    title: '数据分析师',
    company: '示例公司',
    location: '上海',
    salary: '20-30K',
    tags: [],
    description: '',
    companySize: '100-499人',
    financing: 'B轮',
    recruiter: '',
    companyPageText: '',
    stage: 'ready_for_review',
    finalScore: 80,
    matchResult: {
      score: 80,
      passed: true,
      evidence: [],
      gaps: [],
      matchedKeywords: [],
      rejectionReasons: [],
    },
    cityResult: {
      passed: true,
      score: 100,
      normalizedCity: '上海',
      reason: '匹配',
    },
    companyAssessment: {
      score: 70,
      grade: 'B',
      passed: true,
      source: 'page_signals',
      trustDecision: 'trusted',
      aiSummary: '',
      aiEvidence: [],
      researchedAt: null,
      positives: [],
      risks: [],
      recommendedChecks: [],
      externalLinks: [],
    },
    aiReview: null,
    greetingOptions: [],
    recommendedGreetingId: 'match',
    selectedGreeting: '您好，想进一步沟通岗位。',
    approvalStatus: 'approved',
    executionStatus: 'idle',
    queueError: '',
    lastAttemptAt: null,
    rejectionReasons: [],
    discoveredAt: '2026-11-14T00:00:00.000Z',
    updatedAt: '2026-11-14T00:00:00.000Z',
    approvedAt: '2026-11-14T00:00:00.000Z',
    ...overrides,
  };
}

describe('approval gate', () => {
  it('only includes explicitly approved jobs', () => {
    const pending = createJob({ id: 'pending', approvalStatus: 'pending' });
    const approved = createJob({ id: 'approved' });

    expect(isApprovedForQueue(pending)).toBe(false);
    expect(approvedQueue([pending, approved]).map((job) => job.id)).toEqual(['approved']);
  });

  it('executes only when the approved queue has sendable jobs', () => {
    const jobs = [createJob()];

    expect(canExecuteQueue([])).toBe(false);
    expect(canExecuteQueue(jobs)).toBe(true);
  });

  it('does not queue jobs already sent or empty greetings', () => {
    expect(approvedQueue([createJob({ executionStatus: 'sent' })])).toHaveLength(0);
    expect(approvedQueue([createJob({ executionStatus: 'manual_required' })])).toHaveLength(0);
    expect(approvedQueue([createJob({ executionStatus: 'failed' })])).toHaveLength(0);
    expect(approvedQueue([createJob({ selectedGreeting: '  ' })])).toHaveLength(0);
  });
});
