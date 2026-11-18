import type {
  AiJobReview,
  GreetingOption,
  JobRecord,
  ResumeDocument,
  ScreeningSettings,
} from './types';
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
    .replace(/\*\*/gu, '')
    .replace(/本人/gu, '我')
    .replace(/关注到/gu, '看到')
    .replace(/贵公司/gu, '贵司')
    .replace(/进一步沟通/gu, '聊聊')
    .replace(/沟通一下/gu, '聊聊')
    .replace(/恳请/gu, '想')
    .replace(/方便与您/gu, '方便和您');
}

function greetingOptions(value: unknown): GreetingOption[] {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const definitions: Array<[GreetingOption['id'], string, unknown]> = [
    ['match', '完整自荐', record.match],
    ['evidence', '经历重点', record.evidence],
    ['question', '简短提问', record.question],
  ];

  return definitions
    .filter(([, , text]) => typeof text === 'string' && normalizeWhitespace(text).length >= 5)
    .map(([id, label, text]) => ({
      id,
      label,
      text: truncate(humanizeGreeting(String(text)), 420),
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
  resume: ResumeDocument,
  jobContext: string,
  fetchImpl: FetchLike,
): Promise<GreetingOption[]> {
  const response = await requestAiJson(
    settings,
    [
      {
        role: 'system',
        content:
          '你正在代求职者给招聘 HR 写一条完整、自然、专业的自荐消息。表达要真诚，不生硬，也不要说空话；只使用简历、JD 和用户配置中真实存在的信息。只返回 JSON。',
      },
      {
        role: 'user',
        content: [
          '根据下面的简历和岗位 JD 写 3 条不同的开场沟通文案。',
          '输出 JSON：{"greetings":{"match":"","evidence":"","question":""}}',
          '不要输出 Markdown、星号或项目符号，Boss 聊天框按纯文本发送。',
          'match：180-320 个汉字。以“您好！我是”开头，写学校、专业、毕业届，对贵司岗位表达兴趣，提炼一到两项 JD 相关技能，引用一段真实经历，说明每周到岗天数和实习时长，最后表达面试意愿。',
          'evidence：140-240 个汉字，重点写真实项目或实习经历与 JD 的关系。',
          'question：80-180 个汉字，简洁介绍自己和技能，再围绕 JD 真实职责提一个问题。',
          '语气自然专业，可以使用“贵司、非常感兴趣、期待能有面试机会”，但不要连续使用空洞套话。',
          '禁止编造经历、技术、数字、学历、薪资、到岗时间或实习周期。',
          `每周可到岗：${settings.weeklyAvailabilityDays}天`,
          `可实习时长：${settings.internshipDuration || '未填写'}`,
          `希望拓展方向：${settings.growthDirection || '未填写'}`,
          `允许提到 AI 工具经验：${settings.mentionAiToolsInGreeting ? '是，但仅限简历真实出现' : '否'}`,
          `最佳匹配简历：${resume.name}`,
          '简历全文：',
          truncate(resume.text, 10_000),
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

  const resume = [
    ...settings.resumes.filter((candidate) => candidate.id === job.matchedResumeId),
    ...settings.resumes.filter((candidate) => candidate.id !== job.matchedResumeId),
  ].find((candidate) => normalizeWhitespace(candidate.text).length >= 30);
  if (!resume) {
    throw new Error('没有可用于 AI 复核的简历');
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
          '你是严谨的中文求职匹配助手。只依据用户提供的简历、岗位原文和求职配置判断，不得补造经历、学历、数字、到岗时间或技能。招呼语要自然、专业、像求职者认真写给 HR 的第一条消息。仅返回 JSON。',
      },
      {
        role: 'user',
        content: [
          '请输出 JSON：',
          '{"score":0-100,"decision":"pass|reject","summary":"不超过120字","evidence":[""],"concerns":[""],"greetings":{"match":"","evidence":"","question":""}}',
          '任何招呼语必须基于真实简历事实，禁止承诺薪资、到岗时间或面试时间。',
          '不要输出 Markdown、星号或项目符号，Boss 聊天框按纯文本发送。',
          'match 写 180-320 个汉字的完整自荐：学校、专业、毕业届、对贵司岗位的兴趣、一到两项 JD 相关技能、一段真实经历、每周到岗时间、实习时长和面试意愿。',
          'evidence 写 140-240 个汉字，重点说明真实项目或实习经历与 JD 的关系；question 写 80-180 个汉字并围绕 JD 提一个自然问题。',
          '语气自然专业，可以使用“贵司、非常感兴趣、期待能有面试机会”，但避免空泛和重复。',
          `每周可到岗：${settings.weeklyAvailabilityDays}天`,
          `可实习时长：${settings.internshipDuration || '未填写'}`,
          `希望拓展方向：${settings.growthDirection || '未填写'}`,
          `允许提到 AI 工具经验：${settings.mentionAiToolsInGreeting ? '是，但仅限简历真实出现' : '否'}`,
          `最佳匹配简历：${resume.name}`,
          '简历全文：',
          truncate(resume.text, 10_000),
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
      aiGreetingOptions = await generateAiGreetings(job, settings, resume, jobContext, fetchImpl);
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
  const recommended = aiGreetings.find((option) => option.id === 'match') ?? aiGreetings[0];
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
