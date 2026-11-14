import { describe, expect, it } from 'vitest';
import {
  ALL_CITIES,
  CITY_GROUPS,
  cityDisplayName,
  filterCityGroups,
  toCityLevelValues,
} from './china-cities';

describe('city-level selector data', () => {
  it('contains prefecture-level cities without districts or counties', () => {
    expect(ALL_CITIES.length).toBeGreaterThan(250);
    expect(
      ALL_CITIES.every(
        (city) =>
          city.cityName.endsWith('市') ||
          ['香港特别行政区', '澳门特别行政区'].includes(city.cityName),
      ),
    ).toBe(true);
    expect(
      ALL_CITIES.filter(
        (city) => !['香港特别行政区', '澳门特别行政区'].includes(city.cityName),
      ).some((city) => /(自治州|地区|盟|市辖区|县|区)$/u.test(city.cityName)),
    ).toBe(false);
  });

  it('normalizes legacy city values and drops districts or unknown text', () => {
    expect(toCityLevelValues('上海市, 杭州市·西湖区, 不存在市')).toEqual(['上海', '杭州']);
  });

  it('searches by city or province', () => {
    expect(filterCityGroups('杭州')[0]?.cities[0]?.cityName).toBe('杭州市');
    expect(
      filterCityGroups('浙江').some((group) =>
        group.cities.some((city) => city.cityName === '宁波市'),
      ),
    ).toBe(true);
  });

  it('returns the administrative display name for a stored value', () => {
    expect(cityDisplayName('杭州')).toBe('杭州市');
    expect(cityDisplayName('香港')).toBe('香港特别行政区');
  });

  it('groups every city under a province-level label', () => {
    expect(CITY_GROUPS.some((group) => group.provinceName === '浙江')).toBe(true);
  });
});
