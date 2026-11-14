import { APP_SCHEMA_VERSION } from './types';
import type { AppState, ScreeningSettings } from './types';

export const DEFAULT_SETTINGS: ScreeningSettings = {
  resumeText: '',
  targetTitles: '',
  targetCities: '',
  excludedKeywords: '外包,劳务派遣,销售,保险,币圈',
  allowRemote: true,
  minimumResumeScore: 65,
  minimumCompanyScore: 55,
  maxDailyMessages: 12,
  sendIntervalSeconds: 30,
};

export function createDefaultState(): AppState {
  return {
    schemaVersion: APP_SCHEMA_VERSION,
    settings: { ...DEFAULT_SETTINGS },
    jobs: [],
    executionLogs: [],
    lastScanAt: null,
  };
}
