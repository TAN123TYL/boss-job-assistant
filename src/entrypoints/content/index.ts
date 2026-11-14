import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import type { ContentRequest, ContentResponse } from '../../shared/types';
import {
  getPageStatus,
  openJob,
  scanJobsWithInfiniteScroll,
  scanReplySignals,
  sendGreeting,
} from './adapter';

function isContentRequest(value: unknown): value is ContentRequest {
  if (!value || typeof value !== 'object' || !('type' in value)) {
    return false;
  }

  return [
    'BOSS_PAGE_STATUS',
    'BOSS_SCAN_JOBS',
    'BOSS_OPEN_JOB',
    'BOSS_SEND_GREETING',
    'BOSS_CHECK_REPLIES',
  ].includes(String(value.type));
}

async function handleRequest(request: ContentRequest): Promise<ContentResponse> {
  switch (request.type) {
    case 'BOSS_PAGE_STATUS':
      return {
        ok: true,
        status: getPageStatus(),
      };
    case 'BOSS_SCAN_JOBS': {
      const result = await scanJobsWithInfiniteScroll(request.maxPages);
      return {
        ok: true,
        payload: {
          ...result,
          page: getPageStatus(),
        },
      };
    }
    case 'BOSS_OPEN_JOB': {
      const opened = await openJob(request.url);
      return {
        ok: true,
        result: {
          status: opened ? 'sent' : 'not_found',
          message: opened ? '岗位详情已打开' : '未找到岗位卡片',
        },
      };
    }
    case 'BOSS_SEND_GREETING':
      return {
        ok: true,
        result: await sendGreeting(request.url, request.text),
      };
    case 'BOSS_CHECK_REPLIES':
      return {
        ok: true,
        replies: scanReplySignals(),
      };
  }
}

export default defineContentScript({
  matches: ['https://www.zhipin.com/*'],
  runAt: 'document_idle',
  main() {
    browser.runtime.onMessage.addListener((message: unknown) => {
      if (!isContentRequest(message)) {
        return undefined;
      }

      return handleRequest(message).catch((error: unknown): ContentResponse => ({
        ok: false,
        error: error instanceof Error ? error.message : '页面操作失败',
      }));
    });
  },
});
