import { describe, expect, it, vi } from 'vitest';
import { enhanceJobWithAi, parseAiReview, testAiConnection } from './ai';
import { DEFAULT_SETTINGS } from './defaults';
import { buildCandidateProfile } from './matching';
import { screenJob } from './screening';

describe('AI review parsing', () => {
  it('normalizes a valid review without inventing missing greetings', () => {
    const result = parseAiReview(
      {
        score: 87.6,
        decision: 'pass',
        summary: '技能匹配',
        evidence: ['SQL', 'SQL', '用户增长'],
        concerns: ['缺少 A/B 测试'],
        greetings: {
          match: '您好，我关注到贵司岗位，本人SQL经验与岗位匹配度较高，期望有机会进一步沟通。',
          evidence: '',
        },
      },
      '2026-11-14T00:00:00.000Z',
    );

    expect(result.score).toBe(88);
    expect(result.evidence).toEqual(['SQL', '用户增长']);
    expect(result.greetingOptions).toHaveLength(1);
    expect(result.greetingOptions[0]?.text).toBe(
      '您好，我看到贵司岗位，我SQL经验与岗位匹配度较高，期望有机会聊聊。',
    );
  });

  it('rejects malformed AI output', () => {
    expect(() => parseAiReview({ summary: 'missing score' })).toThrow('有效分数');
  });

  it('tests an OpenAI-compatible endpoint', async () => {
    const fakeFetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"ok":true,"message":"连接成功"}' } }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    await expect(
      testAiConnection(
        {
          ...DEFAULT_SETTINGS,
          aiEnabled: true,
          aiApiKey: 'test-key',
        },
        fakeFetch,
      ),
    ).resolves.toBe('AI 连接成功');
  });

  it('makes a dedicated JD-based greeting request when the review omits greetings', async () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      resumeText:
        '本科，掌握 Python、SQL、功能测试和自动化测试，使用禅道提交并回归验证 60+ 个缺陷。',
      targetTitles: '自动化测试 / 测试开发',
      targetCities: '重庆',
      aiEnabled: true,
      aiApiKey: 'test-key',
      aiEndpoint: 'https://api.example.com/v1',
      aiModel: 'test-model',
    };
    const job = screenJob(
      {
        url: 'https://www.zhipin.com/job_detail/ai-greeting.html',
        title: '自动化测试工程师',
        company: '重庆示例科技有限公司',
        location: '重庆·渝北区',
        salary: '8-12K',
        tags: ['Python', '功能测试', 'SQL'],
        description:
          '负责 Web 产品自动化测试、接口测试和回归验证，要求熟悉 Python、SQL，能够使用禅道跟踪缺陷。',
        companySize: '100-499人',
        financing: 'B轮',
        recruiter: '测试经理',
        source: 'detail',
      },
      buildCandidateProfile(settings),
      settings,
    );
    const fakeFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    score: 91,
                    decision: 'pass',
                    summary: '测试经历匹配',
                    evidence: ['Python', '功能测试'],
                    concerns: [],
                    greetings: {},
                  }),
                },
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
                    greetings: {
                      match: '您好，看到咱们在招自动化测试，我做过功能测试和回归验证，方便聊聊吗？',
                      evidence:
                        '您好，我用 Python 做过自动化测试，也通过禅道跟踪过缺陷，想跟您聊聊团队现在的测试重点。',
                      question:
                        '您好，想了解一下这个岗位，我主要做 Python 和功能测试，想问问目前更看重接口测试还是自动化建设？',
                    },
                  }),
                },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

    const result = await enhanceJobWithAi(job, settings, fakeFetch);

    expect(fakeFetch).toHaveBeenCalledTimes(2);
    expect(result.greetingOptions[0]?.text).toContain('看到咱们');
    expect(result.aiReview?.greetingOptions).toHaveLength(3);
    expect(result.selectedGreeting).toContain('自动化测试');
  });
});
