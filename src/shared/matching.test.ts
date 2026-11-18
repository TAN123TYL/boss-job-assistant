import { describe, expect, it } from 'vitest';
import { buildCandidateProfile, buildCandidateProfiles, scoreResumeMatch } from './matching';
import { DEFAULT_SETTINGS } from './defaults';
import type { BossJobDraft, ScreeningSettings } from './types';

const settings: ScreeningSettings = {
  ...DEFAULT_SETTINGS,
  resumes: [
    {
      id: 'data-resume',
      name: '数据分析简历',
      text: [
        '本科，5年经验。',
        '负责数据分析平台建设，熟练使用 SQL、Excel 和 Tableau。',
        '主导用户增长项目，使转化率提升30%。',
      ].join('\n'),
      fileName: '数据分析简历.docx',
      updatedAt: '2026-11-18T00:00:00.000Z',
    },
  ],
  targetTitles: '数据分析, 商业分析',
  targetCities: '上海',
  excludedKeywords: '保险, 外包',
  minimumResumeScore: 65,
};

function createJob(overrides: Partial<BossJobDraft> = {}): BossJobDraft {
  return {
    url: 'https://www.zhipin.com/job_detail/example.html',
    title: '数据分析师',
    company: '上海示例科技有限公司',
    location: '上海·徐汇区',
    salary: '20-30K',
    tags: ['SQL', 'Excel', '本科'],
    description: '负责业务数据分析，要求3年经验，本科及以上，熟练使用 SQL 和 Excel。',
    companySize: '100-499人',
    financing: 'B轮',
    recruiter: '王女士',
    source: 'list',
    ...overrides,
  };
}

describe('resume matching', () => {
  it('extracts skills, education, experience, and highlights', () => {
    const profile = buildCandidateProfile(settings);

    expect(profile.resumeId).toBe('data-resume');
    expect(profile.resumeName).toBe('数据分析简历');
    expect(profile.skills).toEqual(expect.arrayContaining(['sql', 'excel', 'tableau']));
    expect(profile.educationLevel).toBe(2);
    expect(profile.yearsOfExperience).toBe(5);
    expect(profile.highlights.some((highlight) => highlight.includes('30%'))).toBe(true);
  });

  it('scores a closely aligned role above the configured threshold', () => {
    const profile = buildCandidateProfile(settings);
    const result = scoreResumeMatch(createJob(), profile, settings);

    expect(result.score).toBeGreaterThanOrEqual(90);
    expect(result.passed).toBe(true);
    expect(result.matchedKeywords).toEqual(expect.arrayContaining(['sql', 'excel']));
  });

  it('rejects an unrelated role', () => {
    const profile = buildCandidateProfile(settings);
    const result = scoreResumeMatch(
      createJob({
        title: 'Java 后端开发工程师',
        description: '负责 Java 微服务开发，要求5年经验，本科。',
        tags: ['Java', 'Spring'],
      }),
      profile,
      settings,
    );

    expect(result.passed).toBe(false);
    expect(result.score).toBeLessThan(65);
  });

  it('rejects excluded terms before scoring', () => {
    const profile = buildCandidateProfile(settings);
    const result = scoreResumeMatch(
      createJob({ description: '外包驻场项目，负责数据分析。' }),
      profile,
      settings,
    );

    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    expect(result.rejectionReasons[0]).toContain('外包');
  });

  it('recognizes software testing skills from a testing resume', () => {
    const testingProfile = buildCandidateProfile({
      ...settings,
      resumes: [
        {
          id: 'testing-resume',
          name: '测试开发简历',
          text: '本科，2027届。掌握Python、SQL、Linux，具备功能测试、自动化测试、接口测试、回归测试和禅道缺陷管理经验。',
          fileName: '测试开发简历.docx',
          updatedAt: '2026-11-18T00:00:00.000Z',
        },
      ],
      targetTitles: '自动化测试 / 测试开发 / 功能测试',
    });

    expect(testingProfile.targetTitles).toEqual(['自动化测试', '测试开发', '功能测试']);
    expect(testingProfile.skills).toEqual(
      expect.arrayContaining([
        'python',
        'sql',
        'linux',
        '功能测试',
        '自动化测试',
        '接口测试',
        '回归测试',
        '禅道',
      ]),
    );
  });

  it('builds all valid resume profiles for combined screening', () => {
    const profiles = buildCandidateProfiles({
      ...settings,
      resumes: [
        ...settings.resumes,
        {
          id: 'short-resume',
          name: '过短简历',
          text: '太短',
          fileName: '',
          updatedAt: '',
        },
      ],
    });

    expect(profiles).toHaveLength(1);
    expect(profiles[0]?.resumeId).toBe('data-resume');
  });
});
