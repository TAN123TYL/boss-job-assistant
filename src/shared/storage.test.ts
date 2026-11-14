import { describe, expect, it } from 'vitest';
import { migrateAppState } from './storage';

describe('state migration', () => {
  it('fills new v2 settings and job fields from v1 data', () => {
    const migrated = migrateAppState({
      schemaVersion: 1,
      settings: {
        resumeText: '旧简历',
        targetTitles: '数据分析',
        targetCities: '上海',
        minimumResumeScore: 65,
      },
      jobs: [
        {
          id: 'job-1',
          stage: 'ready_for_review',
          companyAssessment: {
            score: 70,
            grade: 'B',
            passed: true,
            positives: [],
            risks: [],
            recommendedChecks: [],
            externalLinks: [],
          },
          executionStatus: 'idle',
        },
      ],
      executionLogs: [],
      lastScanAt: null,
    });

    expect(migrated.schemaVersion).toBe(3);
    expect(migrated.settings.maxScanPages).toBe(5);
    expect(migrated.settings.aiEnabled).toBe(false);
    expect(migrated.settings.minimumResumeScore).toBe(70);
    expect(migrated.jobs[0]?.companyAssessment.source).toBe('page_signals');
    expect(migrated.jobs[0]?.companyPageText).toBe('');
    expect(migrated.jobs[0]?.queueError).toBe('');
  });
});
