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

function humanizeGreeting(value: string): string {
  return normalizeWhitespace(value)
    .replace(/本人/gu, '我')
    .replace(/关注到/gu, '看到')
    .replace(/贵公司|贵司/gu, '公司')
    .replace(/进一步沟通/gu, '聊聊')
    .replace(/沟通一下/gu, '聊聊')
    .replace(/匹配度较高/gu, '挺合适')
    .replace(/期望有机会/gu, '想')
    .replace(/恳请/gu, '想')
    .replace(/方便与您/gu, '方便和您');
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
      text: truncate(humanizeGreeting(String(text)), 120),
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

async function generateAiGreetings(
  job: JobRecord,
  settings: ScreeningSettings,
  jobContext: string,
  fetchImpl: FetchLike,
): Promise<GreetingOption[]> {
  const response = await requestAiJson(
    settings,
    [
      {
        role: 'system',
        content:
          '你正在代求职者给招聘 HR 发第一条消息。必须像微信聊天一样自然，短句、口语化、不说空话，只使用简历和 JD 中真实存在的信息。只返回 JSON。',
      },
      {
        role: 'user',
        content: [
          '根据下面的简历和岗位 JD 写 3 条不同的开场沟通文案。',
          '输出 JSON：{"greetings":{"match":"","evidence":"","question":""}}',
          '每条 40-90 个汉字，都以“您好”开头，只突出一个最相关的真实优势，结尾自然问一个问题。',
          '不要使用“关注到、贵司、进一步沟通、匹配度较高、期望有机会、该岗位”等书面套话。',
          'match：直接说明为什么合适；evidence：引用简历中的真实项目或成果；question：围绕 JD 真实职责提一个问题。',
          '禁止编造经历、技术、数字、学历、薪资或到岗时间。',
          '简历：',
          truncate(settings.resumeText, 10_000),
          '岗位 JD：',
          jobContext,
          `公司：${job.company}`,
          `岗位：${job.title}`,
        ].join('\n'),
      },
    ],
    fetchImpl,
  );
  const record =
    response && typeof response === 'object' ? (response as Record<string, unknown>) : {};

  return greetingOptions(record.greetings);
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
  const jobContext = truncate(
    [
      `公司介绍：${job.companyPageText}`,
      `岗位名称：${job.title}`,
      `公司：${job.company}`,
      `地点：${job.location}`,
      `薪资：${job.salary}`,
      `标签：${job.tags.join('、')}`,
      `岗位 JD：${job.description}`,
    ].join('\n'),
    10_000,
  );
  const response = await requestAiJson(
    settings,
    [
      {
        role: 'system',
        content:
          '你是严谨的中文求职匹配助手。只依据用户提供的简历与岗位原文判断，不得补造经历、学历、数字或技能。招呼语要像在招聘软件里直接给 HR 发消息，短句、口语化、真诚，不要企业腔。仅返回 JSON。',
      },
      {
        role: 'user',
        content: [
          '请输出 JSON：',
          '{"score":0-100,"decision":"pass|reject","summary":"不超过120字","evidence":[""],"concerns":[""],"greetings":{"match":"","evidence":"","question":""}}',
          '任何招呼语必须基于真实简历事实，禁止承诺薪资、到岗时间或面试时间。',
          '每条招呼语控制在40-90个汉字，以“您好”开头，最多提一个真实优势，结尾问一个自然的问题。',
          '避免使用“关注到、进一步沟通、匹配度较高、贵司、该岗位、期望有机会”等正式套话，优先使用“看到、聊聊、方便吗、想问问”。',
          '简历：',
          truncate(settings.resumeText, 10_000),
          '岗位信息与 JD：',
          jobContext,
          `本地规则分：${job.matchResult.score}`,
        ].join('\n'),
      },
    ],
    fetchImpl,
  );

  const review = parseAiReview(response, reviewedAt);
  let aiGreetingOptions = review.greetingOptions;
  if (aiGreetingOptions.length === 0 && settings.aiEnabled) {
    try {
      aiGreetingOptions = await generateAiGreetings(job, settings, jobContext, fetchImpl);
    } catch {
      // Keep the deterministic local greetings as a fallback.
    }
  }
  const rejected = review.decision === 'reject' || review.score < settings.minimumResumeScore;
  const aiGreetings = aiGreetingOptions.length > 0 ? aiGreetingOptions : job.greetingOptions;
  const updatedReview = {
    ...review,
    greetingOptions: aiGreetingOptions,
  };
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
    aiReview: updatedReview,
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
