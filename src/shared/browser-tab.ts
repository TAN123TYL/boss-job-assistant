import { browser } from 'wxt/browser';
import type { ContentRequest, ContentResponse } from './types';

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

  try {
    return await withTimeout(
      browser.tabs.sendMessage(tab.id, request),
      timeoutMs,
      '页面操作超时，已停止等待',
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (/Receiving end does not exist|Could not establish connection/iu.test(message)) {
      throw new Error('Boss 页面尚未连接，请刷新页面后重试', { cause: error });
    }
    throw error;
  }
}
