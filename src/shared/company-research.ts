import { requestAiJson } from './ai';
import type { FetchLike } from './ai';
import type {
  CompanyAssessment,
  CompanyEvidence,
  JobRecord,
  ReliabilityGrade,
  ScreeningSettings,
} from './types';
import { calculateRankingScore } from './scoring';
import { clamp, truncate, unique } from './utils';

interface TavilyResult {
  title?: string;
  url?: string;
  content?: string;
}

interface TavilyResponse {
  results?: TavilyResult[];
}

interface AiCompanyResponse {
  trustScore?: unknown;
  decision?: unknown;
  summary?: unknown;
  positives?: unknown;
  risks?: unknown;
  evidenceIndexes?: unknown;
}

function gradeFromScore(score: number): ReliabilityGrade {
  if (score >= 80) {
    return 'A';
  }
  if (score >= 65) {
    return 'B';
  }
  if (score >= 45) {
    return 'C';
  }
  return 'D';
}

function stringArray(value: unknown, maximum = 8): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return unique(
    value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => truncate(item, 260))
      .filter(Boolean),
  ).slice(0, maximum);
}

async function searchCompany(
  company: string,
  apiKey: string,
  fetchImpl: FetchLike,
): Promise<TavilyResult[]> {
  const response = await fetchImpl('https://api.tavily.com/search', {
    method: 'POST',
    signal: AbortSignal.timeout(60_000),
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      api_key: apiKey,
      query: `${company} 工商信息 经营异常 劳动争议 欠薪 失信 诉讼 行政处罚`,
      search_depth: 'advanced',
      include_answer: false,
      include_raw_content: false,
      max_results: 8,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`公司检索失败 (${response.status}) ${truncate(body, 180)}`);
  }

  const payload = (await response.json()) as TavilyResponse;
  return (payload.results ?? [])
    .filter((result): result is Required<Pick<TavilyResult, 'title' | 'url' | 'content'>> =>
      Boolean(result.title && result.url && result.content),
    )
    .slice(0, 8);
}

export function parseAiCompanyAssessment(
  value: unknown,
  results: TavilyResult[],
): {
  trustScore: number;
  decision: 'trusted' | 'review' | 'risky';
  summary: string;
  positives: string[];
  risks: string[];
  evidence: CompanyEvidence[];
} {
  const response = value && typeof value === 'object' ? (value as AiCompanyResponse) : {};
  const score = Number(response.trustScore);
  if (!Number.isFinite(score)) {
    throw new Error('公司核验结果缺少有效可信分');
  }

  const decision =
    response.decision === 'trusted' || response.decision === 'risky' ? response.decision : 'review';
  const indexes = Array.isArray(response.evidenceIndexes)
    ? response.evidenceIndexes
        .map((index) => Number(index))
        .filter((index) => Number.isInteger(index) && index >= 0 && index < results.length)
    : [];
  const selectedIndexes = indexes.length > 0 ? indexes : results.map((_, index) => index);
  const evidence = selectedIndexes.slice(0, 5).flatMap((index) => {
    const result = results[index];
    if (!result?.title || !result.url || !result.content) {
      return [];
    }
    return [
      {
        title: result.title,
        url: result.url,
        snippet: truncate(result.content, 260),
      },
    ];
  });

  return {
    trustScore: Math.round(clamp(score, 0, 100)),
    decision,
    summary: truncate(String(response.summary ?? ''), 500),
    positives: stringArray(response.positives),
    risks: stringArray(response.risks),
    evidence,
  };
}

function deriveTrustDecision(
  score: number,
  threshold: number,
  aiDecision: 'trusted' | 'review' | 'risky',
): CompanyAssessment['trustDecision'] {
  if (aiDecision === 'risky' || score < Math.min(45, threshold)) {
    return 'risky';
  }
  if (score >= threshold && aiDecision === 'trusted') {
    return 'trusted';
  }
  return 'review';
}

export async function researchCompanyWithAi(
  job: JobRecord,
  settings: ScreeningSettings,
  fetchImpl: FetchLike = fetch,
): Promise<JobRecord> {
  if (
    !settings.companyResearchEnabled ||
    !settings.aiEnabled ||
    !settings.aiApiKey.trim() ||
    !settings.tavilyApiKey.trim() ||
    !job.company.trim()
  ) {
    return job;
  }

  const results = await searchCompany(job.company, settings.tavilyApiKey, fetchImpl);
  if (results.length === 0) {
    return {
      ...job,
      stage: 'company_rejected',
      companyAssessment: {
        ...job.companyAssessment,
        trustDecision: 'unverified',
        aiSummary: '全网检索没有返回可用来源，保留人工核验链接。',
        researchedAt: new Date().toISOString(),
      },
      rejectionReasons: ['公司全网核验没有返回可用来源，未进入待投递队列'],
      updatedAt: new Date().toISOString(),
    };
  }

  const reviewedAt = new Date().toISOString();
  const aiValue = await requestAiJson(
    settings,
    [
      {
        role: 'system',
        content:
          '你是保守的企业背景核验助手。只依据提供的招聘页信息和检索结果判断，不得把搜索结果摘要当作已证实事实。工商异常、失信、欠薪、劳动争议、刑事或行政处罚属于高风险信号。仅返回 JSON。',
      },
      {
        role: 'user',
        content: [
          '请输出 JSON：',
          '{"trustScore":0-100,"decision":"trusted|review|risky","summary":"","positives":[""],"risks":[""],"evidenceIndexes":[0]}',
          '没有来源支持的内容不要写成事实。证据序号必须来自下方结果。',
          `公司：${job.company}`,
          `招聘页信息：${truncate(job.companyPageText || [job.companySize, job.financing, ...job.tags].join(' '), 4000)}`,
          '检索结果：',
          ...results.map(
            (result, index) =>
              `[${index}] ${result.title}\n${result.url}\n${truncate(result.content ?? '', 900)}`,
          ),
        ].join('\n'),
      },
    ],
    fetchImpl,
  );

  const ai = parseAiCompanyAssessment(aiValue, results);
  const verifiedScore = Math.round(job.companyAssessment.score * 0.25 + ai.trustScore * 0.75);
  const trustDecision = deriveTrustDecision(
    verifiedScore,
    settings.companyTrustThreshold,
    ai.decision,
  );
  const passed = trustDecision === 'trusted';
  const companyAssessment: CompanyAssessment = {
    ...job.companyAssessment,
    score: verifiedScore,
    grade: gradeFromScore(verifiedScore),
    passed,
    source: 'ai_web_verified',
    trustDecision,
    aiSummary: ai.summary,
    aiEvidence: ai.evidence,
    researchedAt: reviewedAt,
    positives: unique([...job.companyAssessment.positives, ...ai.positives]),
    risks: unique([...job.companyAssessment.risks, ...ai.risks]),
  };

  return {
    ...job,
    stage: passed ? 'ready_for_review' : 'company_rejected',
    companyAssessment,
    finalScore: calculateRankingScore({
      resumeScore: job.aiReview?.score ?? job.matchResult.score,
      companyScore: verifiedScore,
      cityScore: job.cityResult.score,
    }),
    rejectionReasons: passed
      ? job.rejectionReasons
      : [
          `AI 全网核验未达到可信阈值 ${settings.companyTrustThreshold}：${
            ai.summary || `可信分 ${verifiedScore}`
          }`,
        ],
    updatedAt: reviewedAt,
  };
}

export function hasCompanyResearchConfig(settings: ScreeningSettings): boolean {
  return Boolean(
    settings.aiEnabled &&
    settings.aiApiKey.trim() &&
    settings.companyResearchEnabled &&
    settings.tavilyApiKey.trim(),
  );
}
