// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { detectVerificationPage, scanCurrentPage } from './adapter';

beforeEach(() => {
  document.body.innerHTML = '';
  document.title = 'Boss 直聘';
  window.history.pushState({}, '', '/web/geek/job');
  vi.spyOn(window.HTMLElement.prototype, 'getClientRects').mockReturnValue([
    {
      bottom: 10,
      height: 10,
      left: 0,
      right: 10,
      top: 0,
      width: 10,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    },
  ] as unknown as DOMRectList);
});

describe('BOSS page adapter', () => {
  it('extracts a job card from the current page', () => {
    document.body.innerHTML = `
      <ul class="job-list-box">
        <li class="job-card-wrapper active">
          <a href="https://www.zhipin.com/job_detail/example.html">
            <span class="job-name">数据分析师</span>
          </a>
          <span class="salary">20-30K</span>
          <span class="job-area">上海·徐汇区</span>
          <a class="company-name" href="/gongsi/example.html">上海示例科技有限公司</a>
          <div class="tag-list"><span>SQL</span><span>Excel</span></div>
          <p class="job-sec-text">负责业务数据分析，建立经营指标并支持决策。</p>
        </li>
      </ul>
    `;

    const drafts = scanCurrentPage();

    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({
      title: '数据分析师',
      company: '上海示例科技有限公司',
      location: '上海·徐汇区',
      salary: '20-30K',
    });
    expect(drafts[0]?.tags).toEqual(expect.arrayContaining(['SQL', 'Excel']));
  });

  it('detects verification pages and stops extraction', () => {
    document.title = '安全验证';
    document.body.textContent = '请完成验证';

    expect(detectVerificationPage()).toBe(true);
  });
});
