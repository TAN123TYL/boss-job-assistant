import { browser } from 'wxt/browser';
import type { ContentRequest, ContentResponse } from './types';

const ZHIPIN_URL_PATTERN = 'https://www.zhipin.com/*';
const CHAT_LIST_URL = 'https://www.zhipin.com/web/geek/chat';

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function delay(duration: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, duration);
  });
}

export function jobIdFromUrl(value: string): string | null {
  return value.match(/\/job_detail\/([^/?#]+)/u)?.[1] ?? null;
}

export function sameJobUrl(left: string, right: string): boolean {
  const leftId = jobIdFromUrl(left);
  const rightId = jobIdFromUrl(right);
  return Boolean(leftId && rightId && leftId === rightId);
}

function isConnectionError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : '';
  return /Receiving end does not exist|Could not establish connection/iu.test(message);
}

export async function sendContentRequestToTab(
  tabId: number,
  request: ContentRequest,
  timeoutMs = 30_000,
): Promise<ContentResponse> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 10; attempt += 1) {
    if (attempt > 0) {
      await delay(400);
    }

    try {
      return await withTimeout(
        browser.tabs.sendMessage(tabId, request),
        timeoutMs,
        '页面操作超时，已停止等待',
      );
    } catch (error) {
      lastError = error;
      if (!isConnectionError(error)) {
        throw error;
      }
    }
  }

  throw new Error('Boss 页面尚未连接，请刷新页面后重试', {
    cause: lastError,
  });
}

export async function sendContentRequest(
  request: ContentRequest,
  timeoutMs = 30_000,
): Promise<ContentResponse> {
  const tabs = await browser.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });
  const tab = tabs.find((candidate) => candidate.id != null);

  if (!tab?.id) {
    throw new Error('未找到当前活动的 Boss 页面');
  }
  if (tab.url && !tab.url.startsWith('https://www.zhipin.com/')) {
    throw new Error('请先打开 Boss 直聘网页并停留在岗位列表');
  }

  return sendContentRequestToTab(tab.id, request, timeoutMs);
}

export interface JobTabResult {
  tabId: number;
  created: boolean;
}

async function waitForTabReady(tabId: number): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const tab = await browser.tabs.get(tabId);
    if (tab.status === 'complete' && tab.url?.startsWith('https://www.zhipin.com/')) {
      return;
    }
    await delay(500);
  }
  throw new Error('岗位详情页面加载超时');
}

export async function createAutomationTab(): Promise<number> {
  const tab = await browser.tabs.create({
    url: 'https://www.zhipin.com/web/geek/jobs',
    active: false,
  });
  if (!tab.id) {
    throw new Error('无法创建自动发送标签页');
  }
  await waitForTabReady(tab.id);
  return tab.id;
}

export async function createOrGetChatListTab(): Promise<number> {
  const tabs = await browser.tabs.query({ url: ZHIPIN_URL_PATTERN });
  const existing = tabs.find(
    (tab) => tab.id != null && tab.url && /\/web\/geek\/chat(?:\?|$)/u.test(tab.url),
  );
  if (existing?.id) {
    await browser.tabs.update(existing.id, { active: true }).catch(() => undefined);
    await waitForTabReady(existing.id).catch(() => undefined);
    return existing.id;
  }

  const created = await browser.tabs.create({
    url: CHAT_LIST_URL,
    active: true,
  });
  if (!created.id) {
    throw new Error('无法创建 Boss 消息列表标签页');
  }
  await waitForTabReady(created.id);
  return created.id;
}

export async function navigateTabToJob(tabId: number, sourceUrl: string): Promise<void> {
  await browser.tabs.update(tabId, { url: sourceUrl });
  await waitForTabReady(tabId);
}

export async function getOrCreateJobTab(sourceUrl: string): Promise<JobTabResult> {
  const openTabs = await browser.tabs.query({ url: ZHIPIN_URL_PATTERN });
  const existing = openTabs.find(
    (tab) => tab.id != null && tab.url && sameJobUrl(tab.url, sourceUrl),
  );

  if (existing?.id) {
    return { tabId: existing.id, created: false };
  }

  const created = await browser.tabs.create({
    url: sourceUrl,
    active: false,
  });
  if (!created.id) {
    throw new Error('无法创建岗位详情标签页');
  }

  for (let attempt = 0; attempt < 30; attempt += 1) {
    const tab = await browser.tabs.get(created.id);
    if (tab.status === 'complete' && tab.url?.startsWith('https://www.zhipin.com/')) {
      return { tabId: created.id, created: true };
    }
    await delay(500);
  }

  return { tabId: created.id, created: true };
}

export async function closeTab(tabId: number): Promise<void> {
  await browser.tabs.remove(tabId).catch(() => undefined);
}

export async function waitForTabOpenedBy(tabId: number, timeoutMs = 8_000): Promise<number | null> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const tabs = await browser.tabs.query({});
    const child = tabs.find(
      (tab) =>
        tab.id != null &&
        tab.openerTabId === tabId &&
        (!tab.url || tab.url.startsWith('https://www.zhipin.com/')),
    );
    if (child?.id) {
      await browser.tabs.update(child.id, { active: false }).catch(() => undefined);
      await waitForTabReady(child.id).catch(() => undefined);
      return child.id;
    }
    await delay(400);
  }

  return null;
}

export async function listZhipinTabIds(): Promise<Set<number>> {
  const tabs = await browser.tabs.query({ url: ZHIPIN_URL_PATTERN });
  return new Set(tabs.map((tab) => tab.id).filter((tabId): tabId is number => tabId != null));
}

export async function waitForNewZhipinTab(
  existingTabIds: Set<number>,
  timeoutMs = 8_000,
): Promise<number | null> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const tabs = await browser.tabs.query({ url: ZHIPIN_URL_PATTERN });
    const newTab = tabs.find((tab) => tab.id != null && !existingTabIds.has(tab.id));
    if (newTab?.id) {
      await browser.tabs.update(newTab.id, { active: false }).catch(() => undefined);
      await waitForTabReady(newTab.id).catch(() => undefined);
      return newTab.id;
    }
    await delay(400);
  }

  return null;
}

export async function closeTabsOpenedBy(tabId: number): Promise<void> {
  const tabs = await browser.tabs.query({});
  const children = tabs.filter((tab) => tab.openerTabId === tabId && tab.id);
  await Promise.all(children.map((tab) => (tab.id ? closeTab(tab.id) : Promise.resolve())));
}
