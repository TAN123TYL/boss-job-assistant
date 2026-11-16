import { describe, expect, it } from 'vitest';
import { countSentToday, dateKey, MESSAGE_SEND_INTERVAL_SECONDS } from './execution';
import type { ExecutionLog } from './types';

describe('execution statistics', () => {
  it('uses a fixed five-second interval between approved messages', () => {
    expect(MESSAGE_SEND_INTERVAL_SECONDS).toBe(5);
  });

  it('counts only successful messages for the local calendar day', () => {
    const logs: ExecutionLog[] = [
      {
        id: '1',
        jobId: 'a',
        company: 'A',
        title: '岗位',
        at: '2026-11-14T01:00:00.000Z',
        status: 'sent',
        message: '',
      },
      {
        id: '2',
        jobId: 'b',
        company: 'B',
        title: '岗位',
        at: '2026-11-14T02:00:00.000Z',
        status: 'failed',
        message: '',
      },
      {
        id: '3',
        jobId: 'c',
        company: 'C',
        title: '岗位',
        at: '2026-11-13T02:00:00.000Z',
        status: 'sent',
        message: '',
      },
    ];

    expect(dateKey(new Date(2026, 10, 14))).toBe('2026-11-14');
    expect(countSentToday(logs, new Date(2026, 10, 14, 12))).toBe(1);
  });
});
