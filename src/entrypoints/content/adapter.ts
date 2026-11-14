import type {
  BossJobDraft,
  BossPageStatus,
  BossReplySignal,
  BossScanPayload,
  BossSendResult,
} from '../../shared/types';
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

function jobIdentity(url: string): string {
  const jobId = url.match(/\/job_detail\/([^/?#]+)/u)?.[1];
  return jobId ? `job:${jobId}` : url;
}

export function dedupeJobDrafts(drafts: BossJobDraft[]): {
  drafts: BossJobDraft[];
  duplicatesSkipped: number;
} {
  const byIdentity = new Map<string, BossJobDraft>();

  for (const draft of drafts) {
    const identity = jobIdentity(draft.url);
    const existing = byIdentity.get(identity);
    if (!existing) {
      byIdentity.set(identity, draft);
      continue;
    }

    byIdentity.set(identity, mergeDraft(existing, draft));
  }

  return {
    drafts: [...byIdentity.values()],
    duplicatesSkipped: drafts.length - byIdentity.size,
  };
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
    companyPageText: firstText(detailRoot, [
      '.company-info',
      '.company-info-box',
      '.company-detail',
      '[class*="company-info"]',
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
    companyPageText: detail.companyPageText || base.companyPageText || '',
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
      companyPageText: detail.companyPageText ?? '',
      source: 'detail',
    };
    draftsByUrl.set(directDraft.url, directDraft);
  }

  return [...draftsByUrl.values()];
}

function currentPageSignature(): string {
  return [...document.querySelectorAll<HTMLAnchorElement>(JOB_LINK_SELECTOR)]
    .filter(isVisible)
    .map((link) => jobIdentity(link.href))
    .join('|');
}

function findNextPageControl(): HTMLElement | null {
  const candidates = [...document.querySelectorAll<HTMLElement>('button, a, [role="button"]')];

  return (
    candidates.find((element) => {
      if (!isVisible(element)) {
        return false;
      }

      const text =
        normalizeWhitespace(element.textContent ?? '') ||
        normalizeWhitespace(element.getAttribute('aria-label') ?? '');
      const disabled =
        element.hasAttribute('disabled') ||
        element.getAttribute('aria-disabled') === 'true' ||
        /disabled/iu.test(element.className);
      return !disabled && /^(下一页|下页|next|next page)$/iu.test(text);
    }) ?? null
  );
}

async function waitForPageChange(previousSignature: string): Promise<boolean> {
  const deadline = Date.now() + 10_000;

  while (Date.now() < deadline) {
    await wait(300);
    if (detectVerificationPage()) {
      return false;
    }
    const signature = currentPageSignature();
    if (signature && signature !== previousSignature) {
      return true;
    }
  }

  return false;
}

export async function scanJobsAcrossPages(
  requestedPages: number,
): Promise<Omit<BossScanPayload, 'page'>> {
  const maximumPages = Math.max(1, Math.min(20, Math.round(requestedPages)));
  const collected: BossJobDraft[] = [];
  let pagesScanned = 0;
  let stoppedReason = '';

  for (let pageIndex = 0; pageIndex < maximumPages; pageIndex += 1) {
    if (detectVerificationPage()) {
      stoppedReason = '检测到验证页面，已停止翻页';
      break;
    }

    const pageDrafts = scanCurrentPage();
    pagesScanned += 1;
    if (pageDrafts.length === 0) {
      stoppedReason = pageIndex === 0 ? '当前页面没有读取到岗位' : '下一页没有岗位数据';
      break;
    }
    collected.push(...pageDrafts);

    if (pageIndex >= maximumPages - 1) {
      break;
    }

    const nextControl = findNextPageControl();
    if (!nextControl) {
      stoppedReason = '没有找到下一页按钮';
      break;
    }

    const previousSignature = currentPageSignature();
    nextControl.scrollIntoView({ block: 'center' });
    nextControl.click();
    const changed = await waitForPageChange(previousSignature);
    if (!changed) {
      stoppedReason = detectVerificationPage()
        ? '翻页后出现验证页面'
        : '翻页后岗位列表未发生可识别变化';
      break;
    }
  }

  const deduped = dedupeJobDrafts(collected);
  return {
    drafts: deduped.drafts,
    pagesScanned,
    duplicatesSkipped: deduped.duplicatesSkipped,
    stoppedReason,
  };
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
    const target = link.getAttribute('target');
    link.removeAttribute('target');
    link.click();
    if (target) {
      link.setAttribute('target', target);
    }
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

  editor.innerHTML = '';
  document.execCommand('insertText', false, text);
  if (normalizeWhitespace(editor.textContent ?? '') !== normalizeWhitespace(text)) {
    editor.textContent = text;
  }
  editor.dispatchEvent(
    new InputEvent('input', {
      bubbles: true,
      inputType: 'insertText',
      data: text,
    }),
  );
  return normalizeWhitespace(editor.textContent ?? '') === normalizeWhitespace(text);
}

function isInsideComposer(element: Element): boolean {
  return Boolean(
    element.closest('textarea, input, [contenteditable="true"], button, [role="button"], form'),
  );
}

export function countSentBubbles(text: string): number {
  const expected = normalizeWhitespace(text);
  if (!expected) {
    return 0;
  }

  return [
    ...document.querySelectorAll<HTMLElement>(
      '.chat-message, .message-item, [class*="message"], [class*="bubble"]',
    ),
  ]
    .filter((element) => isVisible(element) && !isInsideComposer(element))
    .filter((element) => {
      const actual = normalizeWhitespace(element.textContent ?? '');
      return (
        actual === expected || (actual.includes(expected) && actual.length <= expected.length + 40)
      );
    }).length;
}

async function waitForSentBubble(text: string, baselineCount: number): Promise<boolean> {
  const deadline = Date.now() + 8_000;

  while (Date.now() < deadline) {
    if (countSentBubbles(text) > baselineCount) {
      return true;
    }
    await wait(250);
  }

  return false;
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

  const messageText = truncate(text, 500);
  const baselineBubbles = countSentBubbles(messageText);
  sendButton.click();

  if (detectVerificationPage()) {
    return {
      status: 'blocked',
      message: '发送后出现验证页面，队列已停止',
    };
  }

  const verified = await waitForSentBubble(messageText, baselineBubbles);
  if (!verified) {
    return {
      status: 'manual_required',
      message: '已触发发送，但未检测到完整文字气泡，请人工确认是否已经发送',
    };
  }

  return {
    status: 'sent',
    message: '已检测到完整发送气泡',
  };
}

function numericText(element: HTMLElement): number {
  const match = normalizeWhitespace(element.textContent ?? '').match(/\d+/u);
  return match ? Number(match[0]) : 0;
}

export function scanReplySignals(): BossReplySignal {
  const unreadElements = [
    ...document.querySelectorAll<HTMLElement>(
      '[class*="unread"], [class*="badge"], [class*="red-dot"], [class*="message-count"]',
    ),
  ].filter(isVisible);
  const counts = unreadElements.map(numericText).filter((count) => count > 0 && count < 1_000);
  const unreadCount = counts.length > 0 ? Math.max(...counts) : unreadElements.length;
  const snippets = unique(
    [
      ...document.querySelectorAll<HTMLElement>(
        '.user-list li, [class*="conversation"], [class*="message-item"]',
      ),
    ]
      .filter(isVisible)
      .map((element) => truncate(element.textContent ?? '', 120))
      .filter(Boolean),
  ).slice(0, 3);

  return {
    unreadCount,
    snippets,
    messageUrl: 'https://www.zhipin.com/web/geek/chat',
  };
}
