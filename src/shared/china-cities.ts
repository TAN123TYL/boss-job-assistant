import areaData from 'china-area-data';
import { normalizeCity } from './city';
import { splitList, unique } from './utils';

export interface CityOption {
  provinceCode: string;
  provinceName: string;
  cityCode: string;
  cityName: string;
  value: string;
}

export interface CityGroup {
  provinceCode: string;
  provinceName: string;
  cities: CityOption[];
}

const MUNICIPALITY_OR_SPECIAL_CODE = new Set([
  '110000',
  '120000',
  '310000',
  '500000',
  '810000',
  '820000',
]);

const PROVINCE_SUFFIX = /(省|市|维吾尔自治区|壮族自治区|回族自治区|自治区|特别行政区)$/u;

function shortProvinceName(value: string): string {
  return value.replace(PROVINCE_SUFFIX, '');
}

function createGroups(): CityGroup[] {
  const provinces = areaData['86'] ?? {};
  const groups: CityGroup[] = [];

  for (const [provinceCode, provinceName] of Object.entries(provinces)) {
    const children = areaData[provinceCode] ?? {};
    const cities = MUNICIPALITY_OR_SPECIAL_CODE.has(provinceCode)
      ? [
          {
            provinceCode,
            provinceName: shortProvinceName(provinceName),
            cityCode: provinceCode,
            cityName: provinceName,
            value: normalizeCity(provinceName),
          },
        ]
      : Object.entries(children)
          .filter(([, cityName]) => cityName.endsWith('市'))
          .map(([cityCode, cityName]) => ({
            provinceCode,
            provinceName: shortProvinceName(provinceName),
            cityCode,
            cityName,
            value: normalizeCity(cityName),
          }));

    if (cities.length > 0) {
      groups.push({
        provinceCode,
        provinceName: shortProvinceName(provinceName),
        cities,
      });
    }
  }

  return groups;
}

export const CITY_GROUPS = createGroups();
export const ALL_CITIES = CITY_GROUPS.flatMap((group) => group.cities);

const CITY_VALUE_ALIASES = new Map<string, CityOption>();
for (const city of ALL_CITIES) {
  CITY_VALUE_ALIASES.set(city.value, city);
  CITY_VALUE_ALIASES.set(normalizeCity(city.cityName), city);
}

export function toCityLevelValues(value: string): string[] {
  return unique(
    splitList(value).flatMap((part) => {
      const normalized = normalizeCity(part);
      return CITY_VALUE_ALIASES.get(normalized)?.value ?? [];
    }),
  );
}

export function cityDisplayName(value: string): string {
  return CITY_VALUE_ALIASES.get(normalizeCity(value))?.cityName ?? value;
}

export function filterCityGroups(query: string): CityGroup[] {
  const normalized = query.trim().toLocaleLowerCase('zh-CN');
  if (!normalized) {
    return CITY_GROUPS;
  }

  return CITY_GROUPS.flatMap((group) => {
    const provinceMatches = group.provinceName.toLocaleLowerCase('zh-CN').includes(normalized);
    const cities = provinceMatches
      ? group.cities
      : group.cities.filter(
          (city) =>
            city.cityName.toLocaleLowerCase('zh-CN').includes(normalized) ||
            city.value.toLocaleLowerCase('zh-CN').includes(normalized),
        );

    return cities.length > 0 ? [{ ...group, cities }] : [];
  });
}
