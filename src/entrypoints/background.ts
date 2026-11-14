import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { loadAppState } from '../shared/storage';
import type { ContentResponse } from '../shared/types';

const REPLY_ALARM = 'boss-reply-check';
const LAST_UNREAD_KEY = 'boss-job-assistant:last-unread-count';
const NOTIFICATION_ID = 'boss-reply-notification';

export function shouldNotifyReplies(previous: number, current: number): boolean {
  return current > 0 && current !== previous;
}

async function checkReplies(): Promise<void> {
  const state = await loadAppState();
  if (!state.settings.replyNotificationsEnabled) {
    await browser.storage.local.set({ [LAST_UNREAD_KEY]: 0 });
    return;
  }

  const tabs = await browser.tabs.query({ url: 'https://www.zhipin.com/*' });
  let unreadCount = 0;
  let firstMessageUrl = 'https://www.zhipin.com/web/geek/chat';

  for (const tab of tabs) {
    if (!tab.id) {
      continue;
    }

    try {
      const response = (await browser.tabs.sendMessage(tab.id, {
        type: 'BOSS_CHECK_REPLIES',
      })) as ContentResponse;
      if (response.ok && 'replies' in response) {
        unreadCount += response.replies.unreadCount;
        if (response.replies.unreadCount > 0) {
          firstMessageUrl = response.replies.messageUrl;
        }
      }
    } catch {
      // A page without a ready content script is expected during navigation.
    }
  }

  const stored = await browser.storage.local.get(LAST_UNREAD_KEY);
  const previous = Number(stored[LAST_UNREAD_KEY] ?? 0);
  await browser.storage.local.set({ [LAST_UNREAD_KEY]: unreadCount });

  if (!shouldNotifyReplies(previous, unreadCount)) {
    return;
  }

  await browser.notifications.create(NOTIFICATION_ID, {
    type: 'basic',
    iconUrl: browser.runtime.getURL('/icon/128.png'),
    title: 'BOSS 有新回复',
    message: `检测到 ${unreadCount} 条未读消息，点击打开沟通页面。`,
  });
  await browser.storage.local.set({
    [`${NOTIFICATION_ID}:url`]: firstMessageUrl,
  });
}

export default defineBackground(() => {
  void browser.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error: unknown) => {
      console.warn('Unable to configure side panel behavior', error);
    });

  const installAlarm = () => {
    void browser.alarms.create(REPLY_ALARM, { periodInMinutes: 5 });
  };
  installAlarm();

  browser.runtime.onInstalled.addListener(installAlarm);
  browser.runtime.onStartup.addListener(installAlarm);
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === REPLY_ALARM) {
      void checkReplies();
    }
  });
  browser.notifications.onClicked.addListener((notificationId) => {
    if (notificationId !== NOTIFICATION_ID) {
      return;
    }

    void browser.storage.local.get(`${NOTIFICATION_ID}:url`).then((stored) => {
      const storedUrl = stored[`${NOTIFICATION_ID}:url`];
      const url =
        typeof storedUrl === 'string' ? storedUrl : 'https://www.zhipin.com/web/geek/chat';
      return browser.tabs.create({ url });
    });
  });
});
