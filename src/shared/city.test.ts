import { describe, expect, it } from 'vitest';
import { matchCity, normalizeCity } from './city';

describe('city filtering', () => {
  it('normalizes common city suffixes', () => {
    expect(normalizeCity('上海市')).toBe('上海');
    expect(normalizeCity('杭州市·西湖区')).toBe('杭州');
  });

  it('accepts a district inside a target city', () => {
    const result = matchCity('上海·浦东新区', '上海市', false);

    expect(result.passed).toBe(true);
    expect(result.normalizedCity).toBe('上海');
    expect(result.score).toBe(100);
  });

  it('rejects a different city', () => {
    const result = matchCity('北京·朝阳区', '上海,杭州', false);

    expect(result.passed).toBe(false);
    expect(result.reason).toContain('不在目标城市');
  });

  it('only accepts remote wording when remote jobs are enabled', () => {
    expect(matchCity('远程', '上海', true).passed).toBe(true);
    expect(matchCity('全国远程', '上海', false).passed).toBe(false);
  });
});
