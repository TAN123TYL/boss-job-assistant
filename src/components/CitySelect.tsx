import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown, MapPin, Search, X } from 'lucide-react';
import {
  CITY_GROUPS,
  cityDisplayName,
  filterCityGroups,
  toCityLevelValues,
} from '../shared/china-cities';

interface CitySelectProps {
  value: string;
  onChange: (value: string) => void;
}

export function CitySelect({ value, onChange }: CitySelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const searchId = useId();
  const selected = toCityLevelValues(value);
  const filteredGroups = filterCityGroups(query);

  useEffect(() => {
    if (!open) {
      return;
    }

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  const toggleCity = (cityValue: string) => {
    const next = selected.includes(cityValue)
      ? selected.filter((item) => item !== cityValue)
      : [...selected, cityValue];
    onChange(next.join(','));
  };

  return (
    <div className="city-select" ref={rootRef}>
      <span className="field__label">
        目标城市
        <small>地级市多选</small>
      </span>
      <div
        className={`city-select__control ${open ? 'is-open' : ''}`}
        role="combobox"
        tabIndex={0}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setOpen((current) => !current);
          }
        }}
      >
        <span className="city-select__summary">
          {selected.length > 0 ? (
            selected.slice(0, 3).map((city) => (
              <span className="city-chip" key={city}>
                <MapPin aria-hidden="true" size={11} />
                {cityDisplayName(city)}
                <button
                  className="city-chip__remove"
                  type="button"
                  aria-label={`移除 ${cityDisplayName(city)}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleCity(city);
                  }}
                >
                  <X aria-hidden="true" size={10} />
                </button>
              </span>
            ))
          ) : (
            <span className="city-select__placeholder">选择城市</span>
          )}
          {selected.length > 3 ? (
            <span className="city-select__more">+{selected.length - 3}</span>
          ) : null}
        </span>
        <ChevronDown aria-hidden="true" size={16} />
      </div>

      {open ? (
        <div className="city-select__popover">
          <label className="city-select__search" htmlFor={searchId}>
            <Search aria-hidden="true" size={14} />
            <input
              id={searchId}
              value={query}
              placeholder="搜索省份或城市"
              onChange={(event) => setQuery(event.target.value)}
              autoFocus
            />
          </label>
          <div className="city-select__groups" role="listbox" aria-multiselectable="true">
            {filteredGroups.map((group) => (
              <section className="city-group" key={group.provinceCode}>
                <h4>{group.provinceName}</h4>
                <div className="city-group__items">
                  {group.cities.map((city) => {
                    const checked = selected.includes(city.value);
                    return (
                      <button
                        className={`city-option ${checked ? 'is-selected' : ''}`}
                        type="button"
                        role="option"
                        aria-selected={checked}
                        key={city.cityCode}
                        onClick={() => toggleCity(city.value)}
                      >
                        <span>{city.cityName}</span>
                        {checked ? <Check aria-hidden="true" size={13} /> : null}
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
            {filteredGroups.length === 0 ? (
              <p className="city-select__empty">没有匹配的地级市</p>
            ) : null}
          </div>
          <div className="city-select__footer">
            <span>
              已选 {selected.length} / {CITY_GROUPS.flatMap((group) => group.cities).length}
            </span>
            <button
              className="button button--ghost button--compact"
              type="button"
              disabled={selected.length === 0}
              onClick={() => onChange('')}
            >
              清空
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
