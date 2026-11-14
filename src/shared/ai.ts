import type { AiJobReview, GreetingOption, JobRecord, ScreeningSettings } from './types';
import { calculateRankingScore } from './scoring';
import { clamp, normalizeWhitespace, truncate, unique } from './utils';

interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

export type FetchLike = typeof fetch;

function completionUrl(endpoint: string): string {
  const normalized = endpoint.trim().replace(/\/+$/u, '');
  return normalized.endsWith('/chat/completions') ? normalized : `${normalized}/chat/completions`;
}

function extractJson(content: string): unknown {
  const trimmed = content
    .trim()
    .replace(/^```(?:json)?/iu, '')
    .replace(/```$/u, '');
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');

  if (firstBrace < 0 || lastBrace <= firstBrace) {
    throw new Error('AI response did not contain JSON');
  }

  return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1)) as unknown;
}

export async function requestAiJson(
  settings: ScreeningSettings,
  messages: ChatMessage[],
  fetchImpl: FetchLike = fetch,
): Promise<unknown> {
  if (!settings.aiApiKey.trim()) {
    throw new Error('尚未配置 AI API Key');
  }
  if (!settings.aiEndpoint.trim() || !settings.aiModel.trim()) {
    throw new Error('AI 接口地址或模型名称为空');
  }

  const response = await fetchImpl(completionUrl(settings.aiEndpoint), {
    method: 'POST',
    signal: AbortSignal.timeout(60_000),
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.aiApiKey.trim()}`,
    },
    body: JSON.stringify({
      model: settings.aiModel.trim(),
      temperature: 0.1,
      messages,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`AI 请求失败 (${response.status}) ${truncate(body, 180)}`);
  }

  const payload = (await response.json()) as ChatCompletionResponse;
  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('AI 返回内容为空');
  }

  return extractJson(content);
}

function stringArray(value: unknown, maximum = 8): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return unique(
    value
      .filter((item): item is string => typeof item === 'string')
      .map(normalizeWhitespace)
      .filter(Boolean),
  ).slice(0, maximum);
}

function greetingOptions(value: unknown): GreetingOption[] {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const definitions: Array<[GreetingOption['id'], string, unknown]> = [
    ['match', '匹配直接', record.match],
    ['evidence', '经历证明', record.evidence],
    ['question', '轻量提问', record.question],
  ];

  return definitions
    .filter(([, , text]) => typeof text === 'string' && normalizeWhitespace(text).length >= 5)
    .map(([id, label, text]) => ({
      id,
      label,
      text: truncate(String(text), 260),
    }))
    .slice(0, 3);
}

export function parseAiReview(value: unknown, reviewedAt = new Date().toISOString()): AiJobReview {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const numericScore = Number(record.score);
  if (!Number.isFinite(numericScore)) {
    throw new Error('AI 匹配结果缺少有效分数');
  }

  const options = greetingOptions(record.greetings);
  return {
    score: Math.round(clamp(numericScore, 0, 100)),
    decision: record.decision === 'reject' ? 'reject' : 'pass',
    summary: truncate(String(record.summary ?? ''), 400),
    evidence: stringArray(record.evidence),
    concerns: stringArray(record.concerns),
    greetingOptions: options,
    reviewedAt,
  };
}

export async function enhanceJobWithAi(
  job: JobRecord,
  settings: ScreeningSettings,
  fetchImpl: FetchLike = fetch,
): Promise<JobRecord> {
  if (!settings.aiEnabled || !settings.aiApiKey.trim()) {
    return job;
  }

  const reviewedAt = new Date().toISOString();
  const response = await requestAiJson(
    settings,
    [
      {
        role: 'system',
        content:
          '你是严谨的中文求职匹配助手。只依据用户提供的简历与岗位原文判断，不得补造经历、学历、数字或技能。仅返回 JSON。',
      },
      {
        role: 'user',
        content: [
          '请输出 JSON：',
          '{"score":0-100,"decision":"pass|reject","summary":"不超过120字","evidence":[""],"concerns":[""],"greetings":{"match":"","evidence":"","question":""}}',
          '任何招呼语必须基于真实简历事实，禁止承诺薪资、到岗时间或面试时间。',
          '简历：',
          truncate(settings.resumeText, 10_000),
          '岗位：',
          truncate(
            [job.title, job.company, job.location, job.salary, ...job.tags, job.description].join(
              '\n',
            ),
            8_000,
          ),
          `本地规则分：${job.matchResult.score}`,
        ].join('\n'),
      },
    ],
    fetchImpl,
  );

  const review = parseAiReview(response, reviewedAt);
  const rejected = review.decision === 'reject' || review.score < settings.minimumResumeScore;
  const aiGreetings =
    review.greetingOptions.length > 0 ? review.greetingOptions : job.greetingOptions;
  const recommended =
    aiGreetings.find((option) => option.id === 'evidence' && /\d/u.test(option.text)) ??
    aiGreetings[0];
  const finalScore = calculateRankingScore({
    resumeScore: review.score,
    companyScore: job.companyAssessment.score,
    cityScore: job.cityResult.score,
  });

  return {
    ...job,
    stage: rejected ? 'ai_rejected' : 'ready_for_review',
    finalScore,
    aiReview: review,
    greetingOptions: aiGreetings,
    recommendedGreetingId: recommended?.id ?? job.recommendedGreetingId,
    selectedGreeting: recommended?.text ?? job.selectedGreeting,
    rejectionReasons: rejected
      ? [`AI 复核未通过：${review.summary || `匹配分 ${review.score}`}`]
      : [],
    updatedAt: reviewedAt,
  };
}

export async function testAiConnection(
  settings: ScreeningSettings,
  fetchImpl: FetchLike = fetch,
): Promise<string> {
  const result = await requestAiJson(
    settings,
    [
      {
        role: 'system',
        content: '只返回 JSON，不要添加其他文字。',
      },
      {
        role: 'user',
        content: '返回 {"ok":true,"message":"连接成功"}',
      },
    ],
    fetchImpl,
  );
  const record = result && typeof result === 'object' ? (result as Record<string, unknown>) : {};

  return record.ok === true ? 'AI 连接成功' : 'AI 已响应，但返回格式不符合预期';
}
