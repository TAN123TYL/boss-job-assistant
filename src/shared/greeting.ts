import type { BossJobDraft, CandidateProfile, GreetingOption, ResumeMatchResult } from './types';
import { normalizeWhitespace, truncate } from './utils';

function pickEvidence(candidate: CandidateProfile, matchResult: ResumeMatchResult): string {
  const matchedSkill = matchResult.matchedKeywords.find((keyword) =>
    candidate.skills.includes(keyword),
  );
  return matchedSkill ?? candidate.skills[0] ?? '相关业务';
}

function formatEvidence(value: string): string {
  const labels: Record<string, string> = {
    python: 'Python',
    sql: 'SQL',
    mysql: 'MySQL',
    linux: 'Linux',
    excel: 'Excel',
    git: 'Git',
    'c++': 'C++',
    'ci/cd': 'CI/CD',
  };
  return labels[value.toLocaleLowerCase('zh-CN')] ?? value;
}

function pickHighlight(candidate: CandidateProfile, matchResult: ResumeMatchResult): string | null {
  const matched = matchResult.matchedKeywords;
  const relevant = candidate.highlights.find((highlight) =>
    matched.some((keyword) => highlight.includes(keyword)),
  );

  return truncate(relevant ?? candidate.highlights[0] ?? '', 42) || null;
}

export function generateGreetings(
  job: BossJobDraft,
  candidate: CandidateProfile,
  matchResult: ResumeMatchResult,
): {
  options: GreetingOption[];
  recommendedId: GreetingOption['id'];
} {
  const company = truncate(job.company || '贵公司', 18);
  const title = truncate(job.title || '这个岗位', 20);
  const evidence = formatEvidence(pickEvidence(candidate, matchResult));
  const highlight = pickHighlight(candidate, matchResult);

  const options: GreetingOption[] = [
    {
      id: 'match',
      label: '自然直接',
      text: normalizeWhitespace(
        `您好，看到${company}在招${title}，我做过${evidence}相关的工作，感觉挺对口的。方便聊聊这个岗位吗？`,
      ),
    },
    {
      id: 'evidence',
      label: '经历带一句',
      text: normalizeWhitespace(
        highlight
          ? `您好，看到咱们在招${title}。我之前${highlight}，和岗位要求比较接近，想跟您具体聊聊，可以吗？`
          : `您好，看到咱们在招${title}，我主要做${evidence}相关的工作，和岗位挺匹配的。方便简单聊聊吗？`,
      ),
    },
    {
      id: 'question',
      label: '轻松提问',
      text: normalizeWhitespace(
        `您好，想了解一下${title}这个岗位～我平时主要做${evidence}，想问问团队现在更看重哪方面能力？`,
      ),
    },
  ];

  const recommendedId: GreetingOption['id'] =
    highlight && /\d/u.test(highlight) ? 'evidence' : 'match';

  return {
    options,
    recommendedId,
  };
}
