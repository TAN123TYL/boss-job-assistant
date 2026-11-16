import { beforeEach, describe, expect, it, vi } from 'vitest';

const storageMocks = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
}));

vi.mock('wxt/browser', () => ({
  browser: {
    storage: {
      local: {
        get: storageMocks.get,
        set: storageMocks.set,
      },
    },
  },
}));

import { createDefaultState } from './defaults';
import { loadAppState } from './storage';

describe('app state loading', () => {
  beforeEach(() => {
    storageMocks.get.mockReset();
    storageMocks.set.mockReset();
    storageMocks.set.mockResolvedValue(undefined);
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
