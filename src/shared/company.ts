import type { BossJobDraft, CompanyAssessment, ReliabilityGrade } from './types';
import { clamp, normalizeWhitespace, unique } from './utils';

const SUSPICIOUS_PHRASES = [
  '押金',
  '培训费',
  '服装费',
  '材料费',
  '垫付',
  '贷款',
  '刷单',
  '高薪轻松',
  '零门槛',
  '不要求经验',
  '先缴费',
  '加微信',
  '私下转账',
];

function reliabilityGrade(score: number): ReliabilityGrade {
  if (score >= 75) {
    return 'A';
  }
  if (score >= 55) {
    return 'B';
  }
  if (score >= 35) {
    return 'C';
  }
  return 'D';
}

function encodeSearch(value: string): string {
  return encodeURIComponent(normalizeWhitespace(value));
}

export function assessCompany(
  job: Pick<
    BossJobDraft,
    'company' | 'description' | 'companySize' | 'financing' | 'salary' | 'tags'
  >,
  minimumCompanyScore: number,
): CompanyAssessment {
  let score = 28;
  const positives: string[] = [];
  const risks: string[] = [];
  const combinedText = normalizeWhitespace(
    [job.company, job.description, job.salary, ...job.tags].join(' '),
  );

  if (job.company.trim().length >= 4) {
    score += 8;
    positives.push('公司名称已展示');
  } else {
    risks.push('公司名称信息不足');
  }

  if (job.companySize.trim()) {
    score += 12;
    positives.push(`公司规模：${job.companySize}`);
  } else {
    risks.push('未显示公司规模');
  }

  if (job.financing.trim()) {
    score += 8;
    positives.push(`融资信息：${job.financing}`);
  }

  if (job.description.length >= 120) {
    score += 14;
    positives.push('岗位描述包含较完整的职责信息');
  } else if (job.description.length >= 50) {
    score += 6;
    positives.push('岗位描述可读，但信息量一般');
  } else {
    risks.push('岗位描述过短，职责边界不清晰');
  }

  if (job.tags.length >= 3) {
    score += 6;
    positives.push('岗位标签较完整');
  }

  if (/面议|薪资面谈/iu.test(job.salary)) {
    risks.push('薪资需要面议，建议沟通时确认范围');
  }

  if (/人力资源|劳务派遣|猎头/iu.test(job.company)) {
    risks.push('招聘主体可能为人力资源或劳务机构，需要核对实际用工单位');
  }

  const suspiciousMatches = SUSPICIOUS_PHRASES.filter((phrase) => combinedText.includes(phrase));
  if (suspiciousMatches.length > 0) {
    score -= Math.min(45, suspiciousMatches.length * 15);
    risks.push(`出现高风险表述：${suspiciousMatches.join('、')}`);
  }

  if (/[1-9]\d{1,2}k/iu.test(job.salary) && /不要求经验|零门槛/iu.test(combinedText)) {
    score -= 18;
    risks.push('高薪与低经验门槛同时出现，需要额外核实');
  }

  score = clamp(Math.round(score), 0, 92);
  const grade = reliabilityGrade(score);
  const recommendedChecks: string[] = [];

  if (grade === 'C' || grade === 'D' || risks.length > 0) {
    recommendedChecks.push('在国家企业信用信息公示系统核对工商状态和经营异常');
    recommendedChecks.push('确认招聘主体、劳动合同主体和实际办公地址是否一致');
    recommendedChecks.push('在正式入职前不要支付押金、培训费或任何私人转账');
  }

  return {
    score,
    grade,
    passed: score >= minimumCompanyScore,
    source: 'page_signals',
    trustDecision: grade === 'A' || grade === 'B' ? 'trusted' : grade === 'C' ? 'review' : 'risky',
    aiSummary: '',
    aiEvidence: [],
    researchedAt: null,
    positives: unique(positives),
    risks: unique(risks),
    recommendedChecks: unique(recommendedChecks),
    externalLinks: [
      {
        label: '国家企业信用信息',
        url: `https://www.gsxt.gov.cn/index.html?searchText=${encodeSearch(job.company)}`,
      },
      {
        label: '企业信息检索',
        url: `https://www.tianyancha.com/search?key=${encodeSearch(job.company)}`,
      },
    ],
  };
}
