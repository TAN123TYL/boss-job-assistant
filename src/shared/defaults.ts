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
  maxScanPages: 5,
  aiEnabled: false,
  aiEndpoint: 'https://api.deepseek.com/v1',
  aiApiKey: '',
  aiModel: 'deepseek-chat',
  companyResearchEnabled: false,
  tavilyApiKey: '',
  companyTrustThreshold: 70,
  replyNotificationsEnabled: true,
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
