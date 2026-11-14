import type { BossJobDraft, CandidateProfile, GreetingOption, ResumeMatchResult } from './types';
import { normalizeWhitespace, truncate } from './utils';

function pickEvidence(candidate: CandidateProfile, matchResult: ResumeMatchResult): string {
  const matchedSkill = matchResult.matchedKeywords.find((keyword) =>
    candidate.skills.includes(keyword),
  );
  return matchedSkill ?? candidate.skills[0] ?? '相关业务';
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
  const title = truncate(job.title || '该岗位', 20);
  const evidence = pickEvidence(candidate, matchResult);
  const highlight = pickHighlight(candidate, matchResult);

  const options: GreetingOption[] = [
    {
      id: 'match',
      label: '匹配直接',
      text: normalizeWhitespace(
        `您好，我关注到${company}的${title}岗位。我在${evidence}方面有相关经历，看过岗位描述后觉得匹配度较高，想和您进一步沟通，方便吗？`,
      ),
    },
    {
      id: 'evidence',
      label: '经历证明',
      text: normalizeWhitespace(
        highlight
          ? `您好，看到${company}在招聘${title}。我有一段与岗位较相关的经历：${highlight}。方便和您确认一下团队的近期重点吗？`
          : `您好，看到${company}在招聘${title}。我的${evidence}经历与岗位职责比较贴近，方便进一步沟通具体需求吗？`,
      ),
    },
    {
      id: 'question',
      label: '轻量提问',
      text: normalizeWhitespace(
        `您好，我在寻找${title}方向的机会，${company}的岗位职责和我过去的${evidence}经历比较接近。想先请教一下，这个岗位目前最看重哪项能力？`,
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
