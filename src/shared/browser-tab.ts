import { browser } from 'wxt/browser';
import type { ContentRequest, ContentResponse } from './types';

export async function sendContentRequest(request: ContentRequest): Promise<ContentResponse> {
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
    return await browser.tabs.sendMessage(tab.id, request);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (/Receiving end does not exist|Could not establish connection/iu.test(message)) {
      throw new Error('Boss 页面尚未连接，请刷新页面后重试', { cause: error });
    }
    throw error;
  }
}
