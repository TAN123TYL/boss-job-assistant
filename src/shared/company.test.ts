import { describe, expect, it } from 'vitest';
import { assessCompany } from './company';

describe('company signal assessment', () => {
  it('returns a strong grade for complete page information', () => {
    const result = assessCompany(
      {
        company: '上海示例科技有限公司',
        description:
          '负责数据分析与经营复盘，协同产品、运营和研发团队建立指标体系，持续优化业务决策流程。' +
          '深入理解业务目标，搭建周度经营看板，推动数据口径统一，并通过专题分析识别增长机会。' +
          '该岗位需要与多个团队协作，形成可执行的分析结论和跟踪机制。' +
          '负责关键指标监测、异常归因和复盘报告，推动分析结论落到产品与运营策略中。',
        companySize: '100-499人',
        financing: 'B轮',
        salary: '20-30K',
        tags: ['SQL', 'Excel', '双休'],
      },
      55,
    );

    expect(result.score).toBeGreaterThanOrEqual(75);
    expect(result.grade).toBe('A');
    expect(result.passed).toBe(true);
    expect(result.risks).not.toContain('岗位描述过短，职责边界不清晰');
  });

  it('rejects suspicious fees and tiny job descriptions', () => {
    const result = assessCompany(
      {
        company: '捷径人力资源有限公司',
        description: '不要求经验，入职前需缴纳培训费和押金。',
        companySize: '',
        financing: '',
        salary: '30-50K',
        tags: [],
      },
      55,
    );

    expect(result.grade).toBe('D');
    expect(result.passed).toBe(false);
    expect(result.risks.join('')).toContain('培训费');
    expect(result.recommendedChecks.length).toBeGreaterThan(0);
  });

  it('creates encoded external verification links', () => {
    const result = assessCompany(
      {
        company: '示例 科技',
        description: '',
        companySize: '',
        financing: '',
        salary: '面议',
        tags: [],
      },
      55,
    );

    expect(result.externalLinks[0]?.url).toContain('%E7%A4%BA%E4%BE%8B');
  });

  it('does not reject a company only because a list card omits metadata', () => {
    const result = assessCompany(
      {
        company: '重庆真实列表科技有限公司',
        description: '',
        companySize: '',
        financing: '',
        salary: '',
        tags: ['Python', '自动化测试', '本科'],
      },
      55,
    );

    expect(result.score).toBeGreaterThanOrEqual(55);
    expect(result.passed).toBe(true);
    expect(result.risks).toEqual(
      expect.arrayContaining(['未显示公司规模', '岗位描述过短，职责边界不清晰']),
    );
  });
});
