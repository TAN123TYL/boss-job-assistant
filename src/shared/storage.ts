import { browser } from 'wxt/browser';
import { createDefaultState } from './defaults';
import { APP_SCHEMA_VERSION } from './types';
import type { AppState } from './types';

const STORAGE_KEY = 'boss-job-assistant:state:v1';

function isValidState(value: unknown): value is AppState {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const state = value as Partial<AppState>;
  return (
    state.schemaVersion === APP_SCHEMA_VERSION &&
    Boolean(state.settings) &&
    Array.isArray(state.jobs) &&
    Array.isArray(state.executionLogs)
  );
}

export async function loadAppState(): Promise<AppState> {
  const stored = await browser.storage.local.get(STORAGE_KEY);
  const value = stored[STORAGE_KEY];

  return isValidState(value) ? value : createDefaultState();
}

export async function saveAppState(state: AppState): Promise<void> {
  await browser.storage.local.set({ [STORAGE_KEY]: state });
}
