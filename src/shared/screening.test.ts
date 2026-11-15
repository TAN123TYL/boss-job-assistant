import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from './defaults';
import { buildCandidateProfile } from './matching';
import {
  canReevaluateRejectedJob,
  mergeScreenedJobs,
  reevaluateStoredJob,
  screenJob,
} from './screening';
import type { BossJobDraft, ScreeningSettings } from './types';

const settings: ScreeningSettings = {
  ...DEFAULT_SETTINGS,
  resumeText:
    '本科，5年经验。负责数据分析平台建设，熟练使用 SQL、Excel 和 Tableau。主导用户增长项目，使转化率提升30%。',
  targetTitles: '数据分析, 商业分析',
  targetCities: '上海',
  excludedKeywords: '保险, 外包',
  minimumResumeScore: 65,
  minimumCompanyScore: 55,
};

function createJob(overrides: Partial<BossJobDraft> = {}): BossJobDraft {
  return {
    url: 'https://www.zhipin.com/job_detail/example.html',
    title: '数据分析师',
    company: '上海示例科技有限公司',
    location: '上海·徐汇区',
    salary: '20-30K',
    tags: ['SQL', 'Excel', '本科'],
    description:
      '负责业务数据分析，要求3年经验，本科及以上，熟练使用 SQL 和 Excel。协同团队建立业务指标体系。',
    companySize: '100-499人',
    financing: 'B轮',
    recruiter: '王女士',
    source: 'list',
    ...overrides,
  };
}

describe('screening pipeline', () => {
  it('runs resume, city, and company checks in order', () => {
    const profile = buildCandidateProfile(settings);
    const result = screenJob(createJob(), profile, settings);

    expect(result.matchResult.passed).toBe(true);
    expect(result.cityResult.passed).toBe(true);
    expect(result.companyAssessment.passed).toBe(true);
    expect(result.stage).toBe('ready_for_review');
    expect(result.greetingOptions).toHaveLength(3);
  });

  it('stops at the city stage after resume matching', () => {
    const profile = buildCandidateProfile(settings);
    const result = screenJob(createJob({ location: '北京·朝阳区' }), profile, settings);

    expect(result.matchResult.passed).toBe(true);
    expect(result.cityResult.passed).toBe(false);
    expect(result.stage).toBe('city_rejected');
  });

  it('stops at the company stage when risk signals are excessive', () => {
    const profile = buildCandidateProfile(settings);
    const result = screenJob(
      createJob({
        company: '捷径人力资源有限公司',
        description: '负责数据分析。不要求经验，入职前需缴纳培训费和押金，薪资30-50K，加微信沟通。',
      }),
      profile,
      settings,
    );

    expect(result.cityResult.passed).toBe(true);
    expect(result.companyAssessment.passed).toBe(false);
    expect(result.stage).toBe('company_rejected');
  });

  it('keeps a matching sparse list card for review instead of rejecting missing metadata', () => {
    const profile = buildCandidateProfile(settings);
    const result = screenJob(
      createJob({
        company: '重庆真实数据科技有限公司',
        description: '',
        companySize: '',
        financing: '',
        tags: ['SQL', 'Excel', '本科'],
      }),
      profile,
      settings,
    );

    expect(result.matchResult.passed).toBe(true);
    expect(result.companyAssessment.passed).toBe(true);
    expect(result.stage).toBe('ready_for_review');
  });

  it('preserves an approved greeting during a rescan', () => {
    const profile = buildCandidateProfile(settings);
    const first = screenJob(createJob(), profile, settings, '2026-11-14T00:00:00.000Z');
    const approved = {
      ...first,
      approvalStatus: 'approved' as const,
      selectedGreeting: '编辑后的沟通内容',
      approvedAt: '2026-11-14T01:00:00.000Z',
    };
    const rescanned = screenJob(createJob(), profile, settings, '2026-11-14T02:00:00.000Z');
    const merged = mergeScreenedJobs([approved], [rescanned]);

    expect(merged[0]?.approvalStatus).toBe('approved');
    expect(merged[0]?.selectedGreeting).toBe('编辑后的沟通内容');
  });

  it('re-evaluates a previously rejected job with current rules', () => {
    const profile = buildCandidateProfile(settings);
    const rejected = screenJob(
      createJob(),
      profile,
      {
        ...settings,
        targetTitles: 'Java 后端',
        excludedKeywords: '数据分析',
      },
      '2026-11-14T00:00:00.000Z',
    );
    const restored = reevaluateStoredJob(rejected, profile, settings, '2026-11-15T00:00:00.000Z');

    expect(rejected.stage).toBe('resume_rejected');
    expect(canReevaluateRejectedJob(rejected)).toBe(true);
    expect(restored.stage).toBe('ready_for_review');
    expect(restored.discoveredAt).toBe(rejected.discoveredAt);
  });

  it('does not re-evaluate jobs already approved, skipped, or sent', () => {
    const profile = buildCandidateProfile(settings);
    const rejected = screenJob(createJob({ location: '北京' }), profile, settings);

    expect(canReevaluateRejectedJob({ ...rejected, approvalStatus: 'approved' })).toBe(false);
    expect(canReevaluateRejectedJob({ ...rejected, approvalStatus: 'skipped' })).toBe(false);
    expect(canReevaluateRejectedJob({ ...rejected, executionStatus: 'sent' })).toBe(false);
  });
});
