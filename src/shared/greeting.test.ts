import { describe, expect, it } from 'vitest';
import { generateGreetings } from './greeting';
import type { BossJobDraft, CandidateProfile, ResumeMatchResult } from './types';

const job: BossJobDraft = {
  url: 'https://www.zhipin.com/job_detail/greeting-test.html',
  title: '自动化测试工程师',
  company: '重庆示例科技有限公司',
  location: '重庆',
  salary: '8-12K',
  tags: ['Python', '功能测试'],
  description: '负责自动化测试和功能测试。',
  companySize: '',
  financing: '',
  recruiter: '',
  source: 'list',
};

const candidate: CandidateProfile = {
  resumeId: 'testing-resume',
  resumeName: '测试开发简历',
  resumeText:
    '重庆交通大学 数据科学与大数据技术 2027届本科生。掌握 Python、功能测试和自动化测试，使用 Codex 辅助代码修改和结果核验。',
  targetTitles: ['自动化测试'],
  targetCities: ['重庆'],
  skills: ['python', '功能测试', '自动化测试'],
  educationLevel: 2,
  yearsOfExperience: 0,
  highlights: ['使用 Python 完成自动化测试脚本，累计提交60+个缺陷。'],
};

const matchResult: ResumeMatchResult = {
  score: 90,
  passed: true,
  evidence: ['简历覆盖 Python、功能测试'],
  gaps: [],
  matchedKeywords: ['python', '功能测试', '自动化测试'],
  rejectionReasons: [],
};

describe('colloquial greetings', () => {
  it('uses natural chat-style wording instead of formal template language', () => {
    const result = generateGreetings(job, candidate, matchResult);
    const combined = result.options.map((option) => option.text).join('\n');

    expect(result.options).toHaveLength(3);
    expect(combined).toContain('您好');
    expect(combined).toContain('Python');
    expect(combined).toContain('贵司');
    expect(combined).toContain('重庆交通大学');
    expect(combined).toContain('数据科学与大数据技术专业');
    expect(combined).toContain('2027届');
    expect(combined).toContain('每周可到岗4天');
    expect(combined).toContain('稳定实习3-6个月');
    expect(combined).toContain('Codex');
    expect(combined).not.toContain('**');
    expect(result.options[0]?.text.length).toBeGreaterThan(100);
    expect(result.options[0]?.text.length).toBeLessThanOrEqual(320);
    expect(result.recommendedId).toBe('match');
  });
});
