import { APP_SCHEMA_VERSION } from './types';
import type { AppBackup, AppState, ScreeningSettings } from './types';
import { migrateAppState } from './storage';

export function createAppBackup(state: AppState, now = new Date()): AppBackup {
  return {
    format: 'boss-job-assistant-backup',
    backupVersion: 1,
    exportedAt: now.toISOString(),
    secretsIncluded: false,
    state: {
      ...state,
      schemaVersion: APP_SCHEMA_VERSION,
      settings: {
        ...state.settings,
        aiApiKey: '',
        tavilyApiKey: '',
      },
    },
  };
}

export function backupToJson(state: AppState): string {
  return JSON.stringify(createAppBackup(state), null, 2);
}

export function parseAppBackup(content: string, currentSettings: ScreeningSettings): AppState {
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch {
    throw new Error('备份文件不是有效 JSON');
  }

  if (!value || typeof value !== 'object') {
    throw new Error('备份文件结构无效');
  }

  const backup = value as Partial<AppBackup>;
  if (backup.format !== 'boss-job-assistant-backup' || !backup.state) {
    throw new Error('不是 Boss 岗位助手备份文件');
  }

  const migrated = migrateAppState(backup.state);
  return {
    ...migrated,
    settings: {
      ...migrated.settings,
      aiApiKey: currentSettings.aiApiKey,
      tavilyApiKey: currentSettings.tavilyApiKey,
    },
  };
}
