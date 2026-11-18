import { describe, expect, it, vi } from 'vitest';
import { parseAiCompanyAssessment, researchCompanyWithAi } from './company-research';
import { DEFAULT_SETTINGS } from './defaults';
import { buildCandidateProfile } from './matching';
import { screenJob } from './screening';
import type { ScreeningSettings } from './types';

const settings: ScreeningSettings = {
  ...DEFAULT_SETTINGS,
  resumes: [
    {
      id: 'data-resume',
      name: '数据分析简历',
      text: '本科，5年经验。负责数据分析平台建设，熟练使用 SQL、Excel 和 Tableau。主导用户增长项目使转化率提升30%。',
      fileName: '数据分析简历.docx',
      updatedAt: '2026-11-18T00:00:00.000Z',
    },
  ],
  targetTitles: '数据分析',
  targetCities: '上海',
  minimumResumeScore: 60,
  aiEnabled: true,
  aiApiKey: 'ai-key',
  aiEndpoint: 'https://api.example.com/v1',
  aiModel: 'model',
  companyResearchEnabled: true,
  tavilyApiKey: 'tavily-key',
  companyTrustThreshold: 70,
};

function createJob() {
  return screenJob(
    {
      url: 'https://www.zhipin.com/job_detail/company-test.html',
      title: '数据分析师',
      company: '上海示例科技有限公司',
      location: '上海·徐汇区',
      salary: '20-30K',
      tags: ['SQL', 'Excel', '本科'],
      description: '负责数据分析，要求3年经验，本科，熟练使用 SQL 和 Excel。',
      companySize: '100-499人',
      financing: 'B轮',
      recruiter: '李女士',
      companyPageText: '上海示例科技有限公司，企业服务行业，100-499人。',
      source: 'detail',
    },
    [buildCandidateProfile(settings)],
    settings,
    '2026-11-14T00:00:00.000Z',
  );
}

describe('company web research', () => {
  it('maps AI evidence indexes to actual search results', async () => {
    const fakeFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            results: [
              {
                title: '国家企业信用信息公示系统',
                url: 'https://www.gsxt.gov.cn/example',
                content: '企业登记状态为存续，未发现经营异常。',
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    trustScore: 84,
                    decision: 'trusted',
                    summary: '工商状态正常，未发现明显负面记录。',
                    positives: ['登记状态存续'],
                    risks: [],
                    evidenceIndexes: [0],
                  }),
                },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

    const result = await researchCompanyWithAi(createJob(), settings, fakeFetch);

    expect(fakeFetch).toHaveBeenCalledTimes(2);
    expect(result.companyAssessment.source).toBe('ai_web_verified');
    expect(result.companyAssessment.trustDecision).toBe('trusted');
    expect(result.companyAssessment.aiEvidence[0]?.url).toBe('https://www.gsxt.gov.cn/example');
    expect(result.stage).toBe('ready_for_review');
  });

  it('rejects malformed trust scores', () => {
    expect(() =>
      parseAiCompanyAssessment({ trustScore: 'unknown', decision: 'trusted' }, [
        { title: 'source', url: 'https://example.com', content: 'content' },
      ]),
    ).toThrow('可信分');
  });

  it('keeps the job for manual review when public search returns no results', async () => {
    const fakeFetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ results: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const result = await researchCompanyWithAi(createJob(), settings, fakeFetch);

    expect(result.stage).toBe('ready_for_review');
    expect(result.companyAssessment.passed).toBe(true);
    expect(result.companyAssessment.trustDecision).toBe('review');
    expect(result.companyAssessment.risks.join('')).toContain('人工复核');
  });

  it('sends conservative review decisions to manual confirmation instead of rejecting', async () => {
    const fakeFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            results: [
              {
                title: '公开企业信息',
                url: 'https://example.com/company',
                content: '企业登记状态存续，未发现明确负面记录。',
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    trustScore: 76,
                    decision: 'review',
                    summary: '公开资料有限，需人工确认。',
                    positives: ['登记状态存续'],
                    risks: ['公开资料有限'],
                    evidenceIndexes: [0],
                  }),
                },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

    const result = await researchCompanyWithAi(createJob(), settings, fakeFetch);

    expect(result.stage).toBe('ready_for_review');
    expect(result.companyAssessment.passed).toBe(true);
    expect(result.companyAssessment.trustDecision).toBe('review');
  });
});
