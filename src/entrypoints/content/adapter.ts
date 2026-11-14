import type { BossJobDraft, BossPageStatus, BossSendResult } from '../../shared/types';
import { normalizeWhitespace, truncate, unique } from '../../shared/utils';

const JOB_LINK_SELECTOR = 'a[href*="/job_detail/"]';
const ACTIVE_CARD_SELECTOR = [
  '.job-card-wrapper.active',
  '.job-card-box.active',
  '.job-list-box li.active',
  '[class*="job-card"][class*="active"]',
].join(', ');
const VERIFICATION_TEXT_PATTERN =
  /(安全验证|请完成验证|拖动滑块|验证码|访问异常|网络环境存在风险|人机验证)/u;

function firstText(root: ParentNode, selectors: string[]): string {
  for (const selector of selectors) {
    const element = root.querySelector<HTMLElement>(selector);
    const text = normalizeWhitespace(element?.textContent ?? '');
    if (text) {
      return text;
    }
  }

  return '';
}

function allText(root: ParentNode, selectors: string[], maximum = 10): string[] {
  for (const selector of selectors) {
    const values = [...root.querySelectorAll<HTMLElement>(selector)]
      .map((element) => normalizeWhitespace(element.textContent ?? ''))
      .filter(Boolean);
    if (values.length > 0) {
      return unique(values).slice(0, maximum);
    }
  }

  return [];
}

function isVisible(element: Element | null): boolean {
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  const style = window.getComputedStyle(element);
  return (
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    style.opacity !== '0' &&
    element.getClientRects().length > 0
  );
}

function extractCompanySize(value: string): string {
  return value.match(/(?:少于\s*)?\d+\s*[-~至]\s*\d+\s*人|\d+\s*人以上|10000人以上/iu)?.[0] ?? '';
}

function extractFinancing(value: string): string {
  return (
    value.match(/(未融资|不需要融资|天使轮|A轮|B轮|C轮|D轮及以上|已上市|战略融资|种子轮)/iu)?.[0] ??
    ''
  );
}

function findJobCard(link: HTMLAnchorElement): HTMLElement | null {
  return link.closest<HTMLElement>(
    '.job-card-wrapper, .job-card-box, .job-list-box li, li, [class*="job-card"]',
  );
}

function extractCard(link: HTMLAnchorElement): BossJobDraft {
  const card = findJobCard(link) ?? link;
  const cardText = normalizeWhitespace(card.textContent ?? '');
  const title =
    firstText(card, ['.job-name', '.job-title', '[class*="job-name"]', '[class*="job-title"]']) ||
    normalizeWhitespace(link.textContent ?? '');
  const company = firstText(card, [
    '.company-name',
    '[class*="company-name"]',
    'a[href*="/gongsi/"]',
  ]);
  const location = firstText(card, [
    '.job-area',
    '.job-area-wrapper',
    '[class*="job-area"]',
    '[class*="job-location"]',
    '[class*="location"]',
  ]);
  const salary = firstText(card, ['.salary', '[class*="salary"]', '[class*="job-salary"]']);
  const tags = unique(
    allText(
      card,
      ['.tag-list li', '.tag-list span', '.job-card-footer .tag-item', '[class*="tag-list"] span'],
      10,
    )
      .flatMap((value) => value.split(/\s+/u))
      .filter((value) => value.length > 0),
  ).slice(0, 10);

  return {
    url: link.href,
    title,
    company,
    location,
    salary,
    tags,
    description: firstText(card, ['.job-sec-text', '.job-detail-section', '[class*="job-desc"]']),
    companySize: extractCompanySize(cardText),
    financing: extractFinancing(cardText),
    recruiter: firstText(card, [
      '.info-public',
      '.boss-name',
      '[class*="recruiter"]',
      '[class*="boss-name"]',
    ]),
    source: 'list',
  };
}

export function extractVisibleDetail(): Partial<BossJobDraft> {
  const detailRoot =
    document.querySelector<HTMLElement>(
      '.job-detail, .job-detail-box, .job-detail-container, [class*="job-detail"]',
    ) ?? document.body;
  const detailText = normalizeWhitespace(detailRoot.textContent ?? '');
  const description = firstText(detailRoot, [
    '.job-sec-text',
    '.job-detail-section .text',
    '.job-detail-section',
    '[class*="job-desc"]',
  ]);
  const title = firstText(detailRoot, [
    '.job-detail-info .name',
    '.job-banner .name',
    '.job-name',
    '[class*="job-title"]',
  ]);
  const company = firstText(detailRoot, [
    '.company-info .name',
    '.company-info-box .name',
    '.company-name',
    'a[href*="/gongsi/"]',
  ]);

  return {
    title,
    company,
    location:
      firstText(detailRoot, [
        '.location-address',
        '.job-location',
        '.job-area',
        '[class*="location"]',
      ]) || '',
    salary: firstText(detailRoot, ['.salary', '.job-salary', '[class*="salary"]']) || '',
    description,
    companySize: extractCompanySize(detailText),
    financing: extractFinancing(detailText),
    recruiter: firstText(detailRoot, [
      '.job-boss-info .name',
      '.boss-info .name',
      '[class*="recruiter"]',
    ]),
    source: 'detail',
  };
}

function mergeDraft(base: BossJobDraft, detail: Partial<BossJobDraft>): BossJobDraft {
  return {
    ...base,
    title: detail.title || base.title,
    company: detail.company || base.company,
    location: detail.location || base.location,
    salary: detail.salary || base.salary,
    description: detail.description || base.description,
    companySize: detail.companySize || base.companySize,
    financing: detail.financing || base.financing,
    recruiter: detail.recruiter || base.recruiter,
    tags: unique([...base.tags, ...(detail.tags ?? [])]),
    source: detail.description ? 'detail' : base.source,
  };
}

export function scanCurrentPage(): BossJobDraft[] {
  const links = [...document.querySelectorAll<HTMLAnchorElement>(JOB_LINK_SELECTOR)].filter(
    isVisible,
  );
  const draftsByUrl = new Map<string, BossJobDraft>();

  for (const link of links) {
    const draft = extractCard(link);
    if (!draft.url || !draft.title) {
      continue;
    }
    draftsByUrl.set(draft.url, draft);
  }

  const detail = extractVisibleDetail();
  const activeLink = document.querySelector<HTMLAnchorElement>(
    `${ACTIVE_CARD_SELECTOR} ${JOB_LINK_SELECTOR}`,
  );

  if (activeLink) {
    const activeDraft = draftsByUrl.get(activeLink.href);
    if (activeDraft) {
      draftsByUrl.set(activeLink.href, mergeDraft(activeDraft, detail));
    }
  } else if (location.pathname.includes('/job_detail/') && detail.title) {
    const directDraft: BossJobDraft = {
      url: location.href,
      title: detail.title,
      company: detail.company ?? '',
      location: detail.location ?? '',
      salary: detail.salary ?? '',
      tags: [],
      description: detail.description ?? '',
      companySize: detail.companySize ?? '',
      financing: detail.financing ?? '',
      recruiter: detail.recruiter ?? '',
      source: 'detail',
    };
    draftsByUrl.set(directDraft.url, directDraft);
  }

  return [...draftsByUrl.values()];
}

export function detectVerificationPage(): boolean {
  const combined = normalizeWhitespace(`${document.title} ${document.body.innerText}`);
  return (
    VERIFICATION_TEXT_PATTERN.test(combined) ||
    /(verify|security-check|captcha)/iu.test(location.pathname)
  );
}

export function getPageStatus(): BossPageStatus {
  const isVerificationPage = detectVerificationPage();
  return {
    connected: location.hostname.endsWith('zhipin.com'),
    url: location.href,
    title: document.title,
    isVerificationPage,
    message: isVerificationPage ? '检测到验证页面，自动执行已停止' : '已连接 Boss 页面',
  };
}

function wait(duration: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, duration);
  });
}

function sameJobUrl(candidate: string, target: string): boolean {
  if (candidate === target) {
    return true;
  }

  const candidateId = candidate.match(/\/job_detail\/([^.?/]+)/u)?.[1];
  const targetId = target.match(/\/job_detail\/([^.?/]+)/u)?.[1];
  return Boolean(candidateId && targetId && candidateId === targetId);
}

function findJobLink(url: string): HTMLAnchorElement | null {
  return (
    [...document.querySelectorAll<HTMLAnchorElement>(JOB_LINK_SELECTOR)].find((link) =>
      sameJobUrl(link.href, url),
    ) ?? null
  );
}

export async function openJob(url: string): Promise<boolean> {
  const link = findJobLink(url);

  if (link) {
    link.scrollIntoView({ block: 'center' });
    link.click();
    await wait(1_200);
    return true;
  }

  if (sameJobUrl(location.href, url)) {
    return true;
  }

  return false;
}

function findCommunicationControl(): HTMLButtonElement | HTMLAnchorElement | null {
  const controls = [
    ...document.querySelectorAll<HTMLButtonElement | HTMLAnchorElement>('button, a'),
  ];

  return (
    controls.find((control) => {
      if (!isVisible(control) || control.hasAttribute('disabled')) {
        return false;
      }

      const text = normalizeWhitespace(control.textContent ?? '');
      return /^(立即沟通|继续沟通|打招呼|发起沟通)$/u.test(text);
    }) ?? null
  );
}

function findChatEditor(): HTMLElement | null {
  const candidates = [
    ...document.querySelectorAll<HTMLElement>('textarea, [contenteditable="true"]'),
  ].filter(isVisible);

  return (
    candidates.find((candidate) => {
      const placeholder =
        candidate.getAttribute('placeholder') ??
        candidate.getAttribute('data-placeholder') ??
        candidate.getAttribute('aria-label') ??
        '';
      return /消息|沟通|回复|输入/u.test(placeholder);
    }) ??
    candidates.at(-1) ??
    null
  );
}

function setComposerValue(editor: HTMLElement, text: string): boolean {
  editor.focus();

  if (editor instanceof HTMLTextAreaElement || editor instanceof HTMLInputElement) {
    const prototype =
      editor instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;

    if (!setter) {
      return false;
    }

    setter.call(editor, text);
    editor.dispatchEvent(
      new InputEvent('input', {
        bubbles: true,
        inputType: 'insertText',
        data: text,
      }),
    );
    editor.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  editor.textContent = text;
  editor.dispatchEvent(
    new InputEvent('input', {
      bubbles: true,
      inputType: 'insertText',
      data: text,
    }),
  );
  return normalizeWhitespace(editor.textContent ?? '') === normalizeWhitespace(text);
}

function findSendButton(): HTMLButtonElement | null {
  return (
    [...document.querySelectorAll<HTMLButtonElement>('button')].find((button) => {
      if (!isVisible(button) || button.disabled) {
        return false;
      }
      return /^(发送|发 送)$/u.test(normalizeWhitespace(button.textContent ?? ''));
    }) ?? null
  );
}

export async function sendGreeting(url: string, text: string): Promise<BossSendResult> {
  if (detectVerificationPage()) {
    return {
      status: 'blocked',
      message: '页面出现验证或访问异常，请人工处理后再继续',
    };
  }

  if (!normalizeWhitespace(text)) {
    return {
      status: 'manual_required',
      message: '沟通文案为空',
    };
  }

  const opened = await openJob(url);
  if (!opened) {
    return {
      status: 'not_found',
      message: '当前页面中未找到对应岗位卡片',
    };
  }

  let editor = findChatEditor();
  if (!editor) {
    const communicationControl = findCommunicationControl();
    if (!communicationControl) {
      return {
        status: 'manual_required',
        message: '未找到沟通入口，请确认岗位仍在招聘且账号已登录',
      };
    }

    communicationControl.click();
    await wait(1_200);
    editor = findChatEditor();
  }

  if (detectVerificationPage()) {
    return {
      status: 'blocked',
      message: '打开沟通后出现验证页面，队列已停止',
    };
  }

  if (!editor) {
    return {
      status: 'manual_required',
      message: '未找到聊天输入框，页面结构可能已变化',
    };
  }

  if (!setComposerValue(editor, truncate(text, 500))) {
    return {
      status: 'manual_required',
      message: '无法写入聊天输入框，请人工检查',
    };
  }

  await wait(250);
  const sendButton = findSendButton();
  if (!sendButton) {
    return {
      status: 'manual_required',
      message: '未找到可用发送按钮，请人工检查',
    };
  }

  sendButton.click();
  await wait(600);

  if (detectVerificationPage()) {
    return {
      status: 'blocked',
      message: '发送后出现验证页面，队列已停止',
    };
  }

  return {
    status: 'sent',
    message: '已点击发送',
  };
}
