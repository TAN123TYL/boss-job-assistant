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
  resumeText: '掌握 Python、功能测试和自动化测试。',
  targetTitles: ['自动化测试'],
  targetCities: ['重庆'],
  skills: ['python', '功能测试', '自动化测试'],
  educationLevel: 2,
  yearsOfExperience: 0,
  highlights: ['使用 Python 完成自动化测试脚本，覆盖 20 个核心流程。'],
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
    expect(combined).not.toMatch(/关注到|进一步沟通|匹配度较高|贵司/gu);
    expect(result.options.every((option) => option.text.length <= 110)).toBe(true);
    expect(result.recommendedId).toBe('evidence');
  });
});
