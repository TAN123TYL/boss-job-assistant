import { describe, expect, it, vi } from 'vitest';
import { parseAiReview, testAiConnection } from './ai';
import { DEFAULT_SETTINGS } from './defaults';

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
          match: '您好，我的 SQL 和用户增长经历与岗位较匹配。',
          evidence: '',
        },
      },
      '2026-11-14T00:00:00.000Z',
    );

    expect(result.score).toBe(88);
    expect(result.evidence).toEqual(['SQL', '用户增长']);
    expect(result.greetingOptions).toHaveLength(1);
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
});
