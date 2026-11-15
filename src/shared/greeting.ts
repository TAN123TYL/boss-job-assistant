import { DEFAULT_SETTINGS } from './defaults';
import type {
  BossJobDraft,
  CandidateProfile,
  GreetingOption,
  ResumeMatchResult,
  ScreeningSettings,
} from './types';
import { normalizeWhitespace, truncate, unique } from './utils';

function pickEvidence(candidate: CandidateProfile, matchResult: ResumeMatchResult): string {
  const matchedSkill = matchResult.matchedKeywords.find((keyword) =>
    candidate.skills.includes(keyword),
  );
  return matchedSkill ?? candidate.skills[0] ?? '相关业务';
}

function pickEvidenceList(candidate: CandidateProfile, matchResult: ResumeMatchResult): string[] {
  return unique([
    ...matchResult.matchedKeywords.filter((keyword) => candidate.skills.includes(keyword)),
    ...candidate.skills,
  ]).slice(0, 2);
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

  return truncate(relevant ?? candidate.highlights[0] ?? '', 72) || null;
}

function extractEducation(resumeText: string): {
  school: string;
  major: string;
  graduationYear: string;
} {
  const schoolMatch = resumeText.match(/([\u4e00-\u9fa5]{2,20}(?:大学|学院))/u);
  const school = schoolMatch?.[1] ?? '';
  const tail = schoolMatch
    ? resumeText.slice((schoolMatch.index ?? 0) + schoolMatch[0].length).replace(/^[\s|｜·-]+/u, '')
    : '';
  return {
    school,
    major:
      tail.match(/^([\u4e00-\u9fa5]{2,24})(?=\s*(?:专业|本科|专科|20\d{2}))/u)?.[1] ??
      resumeText.match(/([\u4e00-\u9fa5]{2,24})专业/u)?.[1] ??
      '',
    graduationYear: resumeText.match(/(20\d{2})届/u)?.[1] ?? '',
  };
}

export function generateGreetings(
  job: BossJobDraft,
  candidate: CandidateProfile,
  matchResult: ResumeMatchResult,
  settings: ScreeningSettings = DEFAULT_SETTINGS,
): {
  options: GreetingOption[];
  recommendedId: GreetingOption['id'];
} {
  const title = truncate(job.title || '开发实习生', 24);
  const evidenceList = pickEvidenceList(candidate, matchResult).map(formatEvidence);
  const evidence = formatEvidence(pickEvidence(candidate, matchResult));
  const evidenceText = evidenceList.length > 1 ? evidenceList.join('和') : evidence;
  const highlight = pickHighlight(candidate, matchResult);
  const highlightSentence = highlight?.replace(/[。！？；;]+$/u, '') ?? '';
  const education = extractEducation(candidate.resumeText);
  const educationIntro =
    education.school || education.major
      ? `我是${education.school}${education.major ? `${education.major}专业` : ''}${
          education.graduationYear ? `${education.graduationYear}届` : ''
        }本科生`
      : '我是一名在校本科生';
  const aiExperience =
    settings.mentionAiToolsInGreeting &&
    /(Codex|ChatGPT|AI\s*Agent|AI工具)/iu.test(candidate.resumeText)
      ? '近期也有使用 Codex 等 AI 工具辅助代码修改和结果核验的实战经验'
      : '';
  const growth = settings.growthDirection.trim()
    ? `虽然我目前积累更多在${evidence}方向，但我学习能力较强，非常希望向${settings.growthDirection.trim()}拓展`
    : '';
  const availabilityParts = [
    settings.weeklyAvailabilityDays > 0 ? `每周可到岗${settings.weeklyAvailabilityDays}天` : '',
    settings.internshipDuration.trim() ? `能稳定实习${settings.internshipDuration.trim()}` : '',
  ].filter(Boolean);
  const availability = availabilityParts.join('，');

  const detailedText = normalizeWhitespace(
    [
      `您好！${educationIntro}，对贵司的${title}岗位非常感兴趣。`,
      `我熟练掌握${evidenceText}。`,
      aiExperience ? `${aiExperience}。` : '',
      highlightSentence ? `我还有一段相关实践：${highlightSentence}。` : '',
      growth ? `${growth}。` : '',
      availability ? `${availability}，期待能有面试机会！` : '期待能有面试机会！',
    ].join(''),
  );

  const evidenceTextShort = normalizeWhitespace(
    [
      `您好！我对贵司的${title}岗位很感兴趣。`,
      `我具备${evidenceText}相关基础`,
      highlightSentence ? `，近期做过：${highlightSentence}` : '',
      growth ? `。${growth}` : '',
      availability ? `。${availability}，期待能有面试机会！` : '，期待能有面试机会！',
    ].join(''),
  );

  const questionText = normalizeWhitespace(
    `您好！我是${education.major || '相关专业'}${
      education.graduationYear ? `${education.graduationYear}届` : ''
    }本科生，对贵司的${title}岗位很感兴趣。我主要掌握${evidenceText}，想了解一下团队目前更看重哪方面能力？`,
  );

  const options: GreetingOption[] = [
    {
      id: 'match',
      label: '完整自荐',
      text: detailedText,
    },
    {
      id: 'evidence',
      label: '经历重点',
      text: evidenceTextShort,
    },
    {
      id: 'question',
      label: '简短提问',
      text: questionText,
    },
  ];

  return {
    options,
    recommendedId: 'match',
  };
}
