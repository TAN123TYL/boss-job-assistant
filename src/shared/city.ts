import type { CityFilterResult } from './types';
import { normalizeWhitespace, splitList, unique } from './utils';

const REMOTE_PATTERN = /(remote|远程|居家办公|在家办公|全国|不限地点)/iu;
const CITY_NOISE_PATTERN = /(·.*|（.*|\(.*|\/.*|-\s*.*)/u;

export function normalizeCity(value: string): string {
  const withoutNoise = normalizeWhitespace(value).replace(CITY_NOISE_PATTERN, '');
  return withoutNoise
    .replace(/(特别行政区|维吾尔自治区|壮族自治区|回族自治区|自治区|自治州|地区|城市|市)$/u, '')
    .trim();
}

export function matchCity(
  location: string,
  targetCitiesValue: string,
  allowRemote: boolean,
): CityFilterResult {
  const rawLocation = normalizeWhitespace(location);
  const targetCities = unique(splitList(targetCitiesValue).map(normalizeCity));
  const normalizedCity = normalizeCity(rawLocation);

  if (!rawLocation) {
    return {
      passed: false,
      score: 0,
      normalizedCity,
      reason: '岗位页面未显示工作地点',
    };
  }

  if (allowRemote && REMOTE_PATTERN.test(rawLocation)) {
    return {
      passed: true,
      score: 90,
      normalizedCity,
      reason: '地点符合远程岗位设置',
    };
  }

  if (targetCities.length === 0) {
    return {
      passed: false,
      score: 0,
      normalizedCity,
      reason: '未配置目标城市',
    };
  }

  const matchedCity = targetCities.find(
    (city) => normalizedCity.includes(city) || rawLocation.includes(city),
  );

  if (!matchedCity) {
    return {
      passed: false,
      score: 0,
      normalizedCity,
      reason: `工作地点 ${rawLocation} 不在目标城市中`,
    };
  }

  const exactMatch = normalizedCity === matchedCity;

  return {
    passed: true,
    score: exactMatch ? 100 : 85,
    normalizedCity: matchedCity,
    reason: exactMatch ? '工作地点与目标城市一致' : `工作地点属于 ${matchedCity}`,
  };
}
