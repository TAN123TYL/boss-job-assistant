import type {
  BossJobDraft,
  CandidateProfile,
  ResumeDocument,
  ResumeMatchResult,
  ResumeMatchSummary,
  ScreeningSettings,
} from './types';
import { clamp, normalizeWhitespace, splitList, unique } from './utils';

const SKILL_DICTIONARY = [
  'typescript',
  'javascript',
  'react',
  'vue',
  'angular',
  'next.js',
  'node.js',
  'python',
  'java',
  'golang',
  'c++',
  'c#',
  'sql',
  'mysql',
  'postgresql',
  'redis',
  'docker',
  'kubernetes',
  'aws',
  'azure',
  'linux',
  'git',
  'figma',
  'sketch',
  'axure',
  'photoshop',
  'tableau',
  'power bi',
  'excel',
  'spss',
  'sas',
  '机器学习',
  '深度学习',
  '大模型',
  '人工智能',
  '自动化测试',
  '测试开发',
  '功能测试',
  '接口测试',
  '性能测试',
  '回归测试',
  '测试用例',
  '缺陷管理',
  '质量保障',
  'selenium',
  'pytest',
  'postman',
  'jmeter',
  'appium',
  'jenkins',
  'ci/cd',
  '禅道',
  '数据分析',
  '数据挖掘',
  '数据可视化',
  '用户研究',
  '用户增长',
  '产品设计',
  '产品经理',
  '项目管理',
  '需求分析',
  '商业分析',
  '运营',
  '内容运营',
  '活动运营',
  '电商运营',
  '新媒体',
  '市场营销',
  '品牌营销',
  '广告投放',
  'seo',
  'sem',
  'crm',
  'erp',
  'saas',
  'b端',
  'c端',
  '供应链',
  '财务分析',
  '人力资源',
  '招聘',
  '英语',
  '日语',
  '沟通',
  '团队管理',
] as const;

const EDUCATION_RANK: Array<{ pattern: RegExp; rank: number }> = [
  { pattern: /博士/u, rank: 4 },
  { pattern: /硕士|研究生|mba/iu, rank: 3 },
  { pattern: /本科|学士|bachelor/iu, rank: 2 },
  { pattern: /大专|专科|associate/iu, rank: 1 },
];

export const RESUME_MATCH_WEIGHTS = {
  title: 20,
  skills: 45,
  experience: 20,
  education: 15,
} as const;

const segmenter =
  typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter('zh-CN', { granularity: 'word' })
    : null;

function tokenize(value: string): string[] {
  const normalized = normalizeWhitespace(value).toLocaleLowerCase('zh-CN');
  const fallbackTokens = normalized
    .split(/[^\p{L}\p{N}+#.]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);

  if (!segmenter) {
    return unique(fallbackTokens);
  }

  const segmented = [...segmenter.segment(normalized)]
    .filter((part) => part.isWordLike)
    .map((part) => part.segment.trim())
    .filter((token) => token.length >= 2);

  return unique([...fallbackTokens, ...segmented]);
}

function detectEducationRank(value: string): number {
  return EDUCATION_RANK.find((item) => item.pattern.test(value))?.rank ?? 0;
}

function detectExplicitYears(value: string): number {
  const matches = [...value.matchAll(/(\d{1,2})\s*年(?:以上)?(?:工作|相关|项目|行业)?经验/gu)];
  return matches.reduce((maximum, match) => {
    const number = Number(match[1]);
    return Number.isFinite(number) ? Math.max(maximum, number) : maximum;
  }, 0);
}

function extractHighlights(resumeText: string): string[] {
  return unique(
    resumeText
      .split(/[\n。；;]+/u)
      .map(normalizeWhitespace)
      .filter((line) => line.length >= 12)
      .filter((line) =>
        /(\d+%|\d+\s*万|\d+\s*个|\d+\s*人|\d+\s*次|\d+\s*年|提升|降低|增长|节省|负责|主导|搭建)/u.test(
          line,
        ),
      )
      .slice(0, 8),
  );
}

export function extractSkills(value: string): string[] {
  const normalized = normalizeWhitespace(value).toLocaleLowerCase('zh-CN');
  return SKILL_DICTIONARY.filter((skill) => normalized.includes(skill.toLocaleLowerCase('zh-CN')));
}

function buildProfileFromResume(
  settings: ScreeningSettings,
  resume: ResumeDocument,
): CandidateProfile {
  const resumeText = normalizeWhitespace(resume.text);

  return {
    resumeId: resume.id,
    resumeName: resume.name,
    resumeText,
    targetTitles: splitList(settings.targetTitles),
    targetCities: splitList(settings.targetCities),
    skills: extractSkills(resumeText),
    educationLevel: detectEducationRank(resumeText),
    yearsOfExperience: detectExplicitYears(resumeText),
    highlights: extractHighlights(resume.text),
  };
}

export function buildCandidateProfiles(settings: ScreeningSettings): CandidateProfile[] {
  return settings.resumes
    .filter((resume) => normalizeWhitespace(resume.text).length >= 30)
    .map((resume) => buildProfileFromResume(settings, resume));
}

export function buildCandidateProfile(settings: ScreeningSettings): CandidateProfile {
  const resume = settings.resumes[0];
  if (!resume) {
    return {
      resumeId: '',
      resumeName: '',
      resumeText: '',
      targetTitles: splitList(settings.targetTitles),
      targetCities: splitList(settings.targetCities),
      skills: [],
      educationLevel: 0,
      yearsOfExperience: 0,
      highlights: [],
    };
  }
  return buildProfileFromResume(settings, resume);
}

function titleSimilarity(targetTitles: string[], jobTitle: string): number {
  if (targetTitles.length === 0) {
    return 0;
  }

  const normalizedTitle = normalizeWhitespace(jobTitle).toLocaleLowerCase('zh-CN');
  const titleTokens = new Set(tokenize(jobTitle));
  let bestScore = 0;

  for (const targetTitle of targetTitles) {
    const normalizedTarget = normalizeWhitespace(targetTitle).toLocaleLowerCase('zh-CN');

    if (normalizedTitle === normalizedTarget) {
      return 1;
    }

    if (normalizedTitle.includes(normalizedTarget) || normalizedTarget.includes(normalizedTitle)) {
      bestScore = Math.max(bestScore, 0.9);
      continue;
    }

    const targetTokens = tokenize(targetTitle);
    const overlap = targetTokens.filter((token) => titleTokens.has(token)).length;
    bestScore = Math.max(bestScore, targetTokens.length > 0 ? overlap / targetTokens.length : 0);
  }

  return bestScore;
}

function skillMatch(
  profile: CandidateProfile,
  job: BossJobDraft,
): {
  score: number;
  matched: string[];
  missing: string[];
} {
  const jobText = normalizeWhitespace(
    [job.title, job.description, ...job.tags].filter(Boolean).join(' '),
  );
  const requiredSkills = extractSkills(jobText);

  if (requiredSkills.length === 0) {
    const resumeTokens = new Set(tokenize(profile.resumeText));
    const jobTokens = tokenize([job.title, job.description, ...job.tags].filter(Boolean).join(' '));
    const overlap = jobTokens.filter((token) => resumeTokens.has(token));

    return {
      score: clamp(overlap.length / Math.max(5, Math.min(16, jobTokens.length)), 0, 0.75),
      matched: overlap.slice(0, 6),
      missing: [],
    };
  }

  const matched = requiredSkills.filter((skill) => profile.skills.includes(skill));
  const missing = requiredSkills.filter((skill) => !profile.skills.includes(skill));

  return {
    score: matched.length / requiredSkills.length,
    matched,
    missing,
  };
}

function experienceMatch(profile: CandidateProfile, job: BossJobDraft): number {
  const jobText = normalizeWhitespace([job.description, ...job.tags].join(' '));
  const requiredYears = detectExplicitYears(jobText);

  if (requiredYears === 0 || profile.yearsOfExperience === 0) {
    return 0.6;
  }

  return clamp(profile.yearsOfExperience / requiredYears, 0, 1);
}

function educationMatch(profile: CandidateProfile, job: BossJobDraft): number {
  const requiredLevel = detectEducationRank(
    normalizeWhitespace([job.description, ...job.tags].join(' ')),
  );

  if (requiredLevel === 0 || profile.educationLevel === 0) {
    return 0.6;
  }

  return profile.educationLevel >= requiredLevel ? 1 : 0.25;
}

export function scoreResumeMatch(
  job: BossJobDraft,
  profile: CandidateProfile,
  settings: ScreeningSettings,
): ResumeMatchResult {
  if (!profile.resumeText) {
    return {
      score: 0,
      passed: false,
      evidence: [],
      gaps: ['尚未填写简历内容'],
      matchedKeywords: [],
      rejectionReasons: ['简历为空'],
    };
  }

  const excludedKeywords = splitList(settings.excludedKeywords);
  const jobText = normalizeWhitespace(
    [job.title, job.company, job.description, ...job.tags].join(' '),
  );
  const excludedMatches = excludedKeywords.filter((keyword) =>
    jobText.toLocaleLowerCase('zh-CN').includes(keyword.toLocaleLowerCase('zh-CN')),
  );

  if (excludedMatches.length > 0) {
    return {
      score: 0,
      passed: false,
      evidence: [],
      gaps: [],
      matchedKeywords: [],
      rejectionReasons: [`命中排除词：${excludedMatches.join('、')}`],
    };
  }

  const titleScore = titleSimilarity(profile.targetTitles, job.title);
  const skills = skillMatch(profile, job);
  const experienceScore = experienceMatch(profile, job);
  const educationScore = educationMatch(profile, job);
  const score = Math.round(
    titleScore * RESUME_MATCH_WEIGHTS.title +
      skills.score * RESUME_MATCH_WEIGHTS.skills +
      experienceScore * RESUME_MATCH_WEIGHTS.experience +
      educationScore * RESUME_MATCH_WEIGHTS.education,
  );

  const evidence: string[] = [];
  const gaps: string[] = [];

  if (titleScore >= 0.75) {
    evidence.push(`岗位方向与目标标题“${job.title}”相近`);
  } else if (profile.targetTitles.length > 0) {
    gaps.push(`岗位标题与目标方向“${profile.targetTitles.join('、')}”重合度有限`);
  }

  if (skills.matched.length > 0) {
    evidence.push(`简历覆盖 ${skills.matched.slice(0, 5).join('、')}`);
  }
  if (skills.missing.length > 0) {
    gaps.push(`简历未明确体现 ${skills.missing.slice(0, 4).join('、')}`);
  }
  if (profile.highlights.length > 0) {
    evidence.push(`可用量化或职责证据 ${profile.highlights.length} 条`);
  }

  const passed = score >= settings.minimumResumeScore;

  return {
    score,
    passed,
    evidence,
    gaps,
    matchedKeywords: unique([...skills.matched, ...(titleScore >= 0.75 ? [job.title] : [])]),
    rejectionReasons: passed ? [] : [`简历匹配分 ${score} 低于阈值 ${settings.minimumResumeScore}`],
  };
}

export interface BestResumeMatch {
  profile: CandidateProfile;
  matchResult: ResumeMatchResult;
  summaries: ResumeMatchSummary[];
}

export function selectBestResumeMatch(
  job: BossJobDraft,
  profiles: CandidateProfile[],
  settings: ScreeningSettings,
): BestResumeMatch {
  const evaluated = profiles.map((profile) => ({
    profile,
    matchResult: scoreResumeMatch(job, profile, settings),
  }));
  const best =
    evaluated.sort((left, right) => right.matchResult.score - left.matchResult.score)[0] ??
    ({
      profile: buildCandidateProfile(settings),
      matchResult: {
        score: 0,
        passed: false,
        evidence: [],
        gaps: ['尚未填写可用的简历'],
        matchedKeywords: [],
        rejectionReasons: ['没有可用简历'],
      },
    } satisfies { profile: CandidateProfile; matchResult: ResumeMatchResult });

  return {
    ...best,
    summaries: evaluated.map(({ profile, matchResult }) => ({
      resumeId: profile.resumeId,
      resumeName: profile.resumeName,
      score: matchResult.score,
      passed: matchResult.passed,
    })),
  };
}
