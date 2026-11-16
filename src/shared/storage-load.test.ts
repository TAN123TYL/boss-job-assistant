import { beforeEach, describe, expect, it, vi } from 'vitest';

const storageMocks = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  remove: vi.fn(),
}));

vi.mock('wxt/browser', () => ({
  browser: {
    storage: {
      local: {
        get: storageMocks.get,
        set: storageMocks.set,
        remove: storageMocks.remove,
      },
    },
  },
}));

import { createDefaultState } from './defaults';
import { loadAppState, saveAppState } from './storage';

describe('app state loading', () => {
  beforeEach(() => {
    storageMocks.get.mockReset();
    storageMocks.set.mockReset();
    storageMocks.remove.mockReset();
    storageMocks.set.mockResolvedValue(undefined);
    storageMocks.remove.mockResolvedValue(undefined);
  });

  it('migrates a valid legacy v5 state into the current v6 store', async () => {
    storageMocks.get.mockResolvedValue({
      'boss-job-assistant:state:v5': {
        ...createDefaultState(),
        schemaVersion: 5,
      },
    });

    const state = await loadAppState();

    expect(state.schemaVersion).toBe(6);
    expect(storageMocks.set).toHaveBeenCalledOnce();
    expect(storageMocks.remove).toHaveBeenCalled();
  });

  it('removes legacy keys and retries with compacted state after a quota error', async () => {
    const state = createDefaultState();
    state.executionLogs = Array.from({ length: 350 }, (_, index) => ({
      id: `log-${index}`,
      jobId: `job-${index}`,
      company: '示例公司',
      title: '示例岗位',
      at: '2026-11-16T00:00:00.000Z',
      status: 'sent' as const,
      message: '已发送',
    }));
    storageMocks.set
      .mockRejectedValueOnce(new Error('Resource::kQuotaBytes quota exceeded'))
      .mockResolvedValueOnce(undefined);

    await saveAppState(state);

    expect(storageMocks.remove).toHaveBeenCalled();
    expect(storageMocks.set).toHaveBeenCalledTimes(2);
    const persisted = storageMocks.set.mock.calls[1]?.[0] as Record<string, typeof state>;
    expect(persisted['boss-job-assistant:state:v6']?.executionLogs).toHaveLength(300);
  });

  it('rejects instead of hanging forever when storage never resolves', async () => {
    vi.useFakeTimers();
    storageMocks.get.mockReturnValue(new Promise(() => undefined));

    const loading = loadAppState();
    const rejection = loading.catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(3_000);

    const error = await rejection;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('读取本地数据超时');
    vi.useRealTimers();
  });
});
