import { describe, expect, it } from 'vitest';
import {
  canRecoverJob,
  transitionFromResult,
  transitionToQueued,
  transitionToRecovered,
  transitionToSending,
} from './queue';
import type { JobRecord } from './types';

function createJob(overrides: Partial<JobRecord> = {}): JobRecord {
  return {
    id: 'job-1',
    fingerprint: 'job-1',
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
    cityResult: { passed: true, score: 100, normalizedCity: '上海', reason: '匹配' },
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

describe('queue state machine', () => {
  it('requires queued and sending states before a verified result', () => {
    const queued = transitionToQueued(createJob(), '2026-11-14T01:00:00.000Z');
    const sending = transitionToSending(queued, '2026-11-14T01:01:00.000Z');
    const sent = transitionFromResult(
      sending,
      'sent',
      '已检测到完整发送气泡',
      '2026-11-14T01:01:02.000Z',
    );

    expect(queued.executionStatus).toBe('queued');
    expect(sending.executionStatus).toBe('sending');
    expect(sent.executionStatus).toBe('sent');
    expect(sent.queueError).toBe('');
  });

  it('locks an unverified send for manual recovery', () => {
    const sending = transitionToSending(
      transitionToQueued(createJob(), '2026-11-14T01:00:00.000Z'),
      '2026-11-14T01:01:00.000Z',
    );
    const result = transitionFromResult(
      sending,
      'manual_required',
      '未检测到发送气泡',
      '2026-11-14T01:01:02.000Z',
    );

    expect(result.executionStatus).toBe('manual_required');
    expect(canRecoverJob(result, false)).toBe(false);
    expect(canRecoverJob(result, true)).toBe(true);
    expect(transitionToRecovered(result, '2026-11-14T01:02:00.000Z').executionStatus).toBe('idle');
  });
});
