// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  countSentBubbles,
  dedupeJobDrafts,
  detectVerificationPage,
  scanCurrentPage,
  scanJobsWithInfiniteScroll,
} from './adapter';

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
  Object.defineProperty(window.HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  });
  Object.defineProperty(window, 'scrollTo', {
    configurable: true,
    value: vi.fn(),
  });
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

  it('deduplicates jobs by job_detail id', () => {
    const base = {
      title: '数据分析师',
      company: '示例公司',
      location: '上海',
      salary: '20-30K',
      tags: [],
      description: '旧描述',
      companySize: '',
      financing: '',
      recruiter: '',
      source: 'list' as const,
    };
    const result = dedupeJobDrafts([
      {
        ...base,
        url: 'https://www.zhipin.com/job_detail/abc.html?from=search',
      },
      {
        ...base,
        description: '新描述',
        url: 'https://www.zhipin.com/job_detail/abc.html?from=detail',
      },
    ]);

    expect(result.drafts).toHaveLength(1);
    expect(result.duplicatesSkipped).toBe(1);
    expect(result.drafts[0]?.description).toBe('新描述');
  });

  it('counts only visible message bubbles outside the composer', () => {
    document.body.innerHTML = `
      <div class="chat-message">您好，想进一步沟通岗位。</div>
      <div contenteditable="true">您好，想进一步沟通岗位。</div>
    `;

    expect(countSentBubbles('您好，想进一步沟通岗位。')).toBe(1);
  });

  it('loads more jobs by scrolling when there is no next-page button', async () => {
    const createCard = (id: string, title: string) => `
      <li class="job-card-box">
        <a href="https://www.zhipin.com/job_detail/${id}.html">
          <span class="job-name">${title}</span>
        </a>
        <span class="salary">20-30K</span>
        <span class="job-area">重庆·渝中区</span>
        <a class="company-name" href="/gongsi/example.html">示例公司</a>
      </li>
    `;
    document.body.innerHTML = `
      <div class="job-recommend-result">
        <div class="job-list-container">
          <ul class="rec-job-list">
            ${createCard('job-a', '数据分析师')}
          </ul>
        </div>
      </div>
    `;
    const onScroll = () => {
      document
        .querySelector('.rec-job-list')
        ?.insertAdjacentHTML('beforeend', createCard('job-b', '商业分析师'));
    };
    window.addEventListener('scroll', onScroll, { once: true });

    const result = await scanJobsWithInfiniteScroll(2);

    expect(result.drafts.map((job) => job.title)).toEqual(['数据分析师', '商业分析师']);
    expect(result.pagesScanned).toBe(2);
  });
});
