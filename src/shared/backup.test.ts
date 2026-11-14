import { describe, expect, it } from 'vitest';
import { backupToJson, createAppBackup, parseAppBackup } from './backup';
import { createDefaultState, DEFAULT_SETTINGS } from './defaults';

describe('backup', () => {
  it('does not export API keys', () => {
    const state = createDefaultState();
    state.settings = {
      ...state.settings,
      aiApiKey: 'secret-ai',
      tavilyApiKey: 'secret-search',
    };

    const backup = createAppBackup(state, new Date('2026-11-14T00:00:00.000Z'));
    const json = backupToJson(state);

    expect(backup.secretsIncluded).toBe(false);
    expect(backup.state.settings.aiApiKey).toBe('');
    expect(backup.state.settings.tavilyApiKey).toBe('');
    expect(json).not.toContain('secret-ai');
  });

  it('restores state while preserving current local keys', () => {
    const state = createDefaultState();
    const backupJson = backupToJson(state);
    const restored = parseAppBackup(backupJson, {
      ...DEFAULT_SETTINGS,
      aiApiKey: 'current-ai',
      tavilyApiKey: 'current-search',
    });

    expect(restored.settings.aiApiKey).toBe('current-ai');
    expect(restored.settings.tavilyApiKey).toBe('current-search');
  });
});
