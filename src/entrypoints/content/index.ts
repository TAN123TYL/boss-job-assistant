import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import type {
  ContentRequest,
  ContentResponse,
  ScanProgress,
  ScanProgressMessage,
} from '../../shared/types';
import {
  getPageStatus,
  openJob,
  scanJobsWithInfiniteScroll,
  scanReplySignals,
  sendGreeting,
  sendTextInConversationList,
  sendTextInOpenChat,
} from './adapter';

let cancelScanRequested = false;

function publishScanProgress(progress: ScanProgress): void {
  const message: ScanProgressMessage = {
    type: 'BOSS_SCAN_PROGRESS',
    progress,
  };
  void browser.runtime.sendMessage(message).catch(() => undefined);
}

function isContentRequest(value: unknown): value is ContentRequest {
  if (!value || typeof value !== 'object' || !('type' in value)) {
    return false;
  }

  return [
    'BOSS_PAGE_STATUS',
    'BOSS_SCAN_JOBS',
    'BOSS_OPEN_JOB',
    'BOSS_SEND_GREETING',
    'BOSS_SEND_CHAT_TEXT',
    'BOSS_SEND_CHAT_LIST_TEXT',
    'BOSS_CHECK_REPLIES',
    'BOSS_CANCEL_SCAN',
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
      cancelScanRequested = false;
      const result = await scanJobsWithInfiniteScroll(
        request.maxPages,
        request.hydrateDetails,
        request.maxDetails,
        {
          onProgress: publishScanProgress,
          shouldCancel: () => cancelScanRequested,
        },
      );
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
    case 'BOSS_SEND_CHAT_TEXT':
      return {
        ok: true,
        result: await sendTextInOpenChat(request.text),
      };
    case 'BOSS_SEND_CHAT_LIST_TEXT':
      return {
        ok: true,
        result: await sendTextInConversationList(
          request.company,
          request.title,
          request.recruiter,
          request.text,
        ),
      };
    case 'BOSS_CHECK_REPLIES':
      return {
        ok: true,
        replies: scanReplySignals(),
      };
    case 'BOSS_CANCEL_SCAN':
      cancelScanRequested = true;
      publishScanProgress({
        phase: 'finishing',
        message: '正在停止扫描并保留已读取结果',
        current: 0,
        total: 0,
      });
      return {
        ok: true,
        cancelled: true,
      };
  }
}

export default defineContentScript({
  matches: ['https://www.zhipin.com/*'],
  runAt: 'document_idle',
  main() {
    browser.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
      if (!isContentRequest(message)) {
        return false;
      }

      void handleRequest(message)
        .catch((error: unknown): ContentResponse => ({
          ok: false,
          error: error instanceof Error ? error.message : '页面操作失败',
        }))
        .then(sendResponse);
      return true;
    });
  },
});
