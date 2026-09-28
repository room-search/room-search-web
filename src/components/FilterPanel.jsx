import { useEffect, useRef, useState } from 'react';
import { ChevronDown, RotateCcw, X } from 'lucide-react';
import { DEFAULT_FILTERS, FILTER_RANGES, SCORE_FILTER_FIELDS, countActiveFilters } from '../lib/filters.js';

const SCORE_LABELS = {
  difficulty: '난이도',
  fear: '공포도',
  activity: '활동성',
  story: '스토리',
  problem: '문제',
  interior: '인테리어',
  act: '연기력',
  satisfy: '만족도',
};
const PRIMARY_SCORE_FIELDS = ['difficulty', 'fear'];
const EXTRA_SCORE_FIELDS = SCORE_FILTER_FIELDS.filter((field) => !PRIMARY_SCORE_FIELDS.includes(field));
const NUMBER_FORMAT = new Intl.NumberFormat('ko-KR');

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function scoreText(value) {
  return Number(value).toFixed(1) + '점';
}

function priceText(value) {
  return NUMBER_FORMAT.format(value) + '원';
}

function playtimeText(value) {
  return NUMBER_FORMAT.format(value) + '분';
}

function describeRange(lower, upper, range, formatValue) {
  const hasLower = lower > range.min;
  const hasUpper = upper < range.max;
  if (!hasLower && !hasUpper) return '전체';
  return [
    hasLower ? formatValue(lower) + ' 이상' : '',
    hasUpper ? formatValue(upper) + ' 이하' : '',
  ].filter(Boolean).join(' · ');
}

function RangeFilter({ filterKey, label, value, range, idPrefix, formatValue, lowerHint, upperHint, onChange }) {
  const trackRef = useRef(null);
  const dragRef = useRef(null);
  const [activeThumb, setActiveThumb] = useState('upper');
  const name = capitalize(filterKey);
  const lowerKey = 'start' + name;
  const upperKey = 'end' + name;
  const lowerId = `${idPrefix}-${filterKey}-lower`;
  const upperId = `${idPrefix}-${filterKey}-upper`;
  const lower = Math.max(range.min, Math.min(range.max, Number(value[lowerKey] ?? range.min)));
  const upper = Math.max(lower, Math.min(range.max, Number(value[upperKey] ?? range.max)));
  const toPercent = (number) => ((number - range.min) / (range.max - range.min)) * 100;

  useEffect(() => {
    function finishDrag(event) {
      const drag = dragRef.current;
      if (!drag || (Number.isInteger(event?.pointerId) && drag.pointerId !== event.pointerId)) return;
      dragRef.current = null;
      const slider = trackRef.current?.parentElement;
      if (slider?.hasPointerCapture?.(drag.pointerId)) {
        slider.releasePointerCapture?.(drag.pointerId);
      }
    }

    function finishWhenHidden() {
      if (document.visibilityState === 'hidden') finishDrag();
    }

    window.addEventListener('pointerup', finishDrag, true);
    window.addEventListener('pointercancel', finishDrag, true);
    window.addEventListener('blur', finishDrag);
    document.addEventListener('visibilitychange', finishWhenHidden);
    return () => {
      window.removeEventListener('pointerup', finishDrag, true);
      window.removeEventListener('pointercancel', finishDrag, true);
      window.removeEventListener('blur', finishDrag);
      document.removeEventListener('visibilitychange', finishWhenHidden);
    };
  }, []);

  function updateFromPointer(clientX, side, offset = 0) {
    const track = trackRef.current;
    if (!track) return;
    const bounds = track.getBoundingClientRect();
    if (!bounds.width) return;
    const percent = Math.max(0, Math.min(1, (clientX - offset - bounds.left) / bounds.width));
    const raw = range.min + percent * (range.max - range.min);
    const snapped = Number((range.min + Math.round((raw - range.min) / range.step) * range.step).toFixed(4));
    if (side === 'lower') {
      onChange({ ...value, [lowerKey]: Math.min(snapped, upper) });
    } else {
      onChange({ ...value, [upperKey]: Math.max(snapped, lower) });
    }
  }

  function handlePointerDown(event) {
    if (event.button !== 0) return;
    const track = trackRef.current;
    if (!track) return;
    const bounds = track.getBoundingClientRect();
    if (!bounds.width) return;

    const target = event.target instanceof Element ? event.target.closest('[data-range-thumb]') : null;
    const pointerPercent = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
    const pointerValue = range.min + pointerPercent * (range.max - range.min);
    const nearestThumb = Math.abs(pointerValue - lower) === Math.abs(pointerValue - upper)
      ? activeThumb
      : Math.abs(pointerValue - lower) < Math.abs(pointerValue - upper) ? 'lower' : 'upper';
    const side = target?.dataset.rangeThumb || nearestThumb;
    const currentValue = side === 'lower' ? lower : upper;
    const thumbCenter = bounds.left + toPercent(currentValue) / 100 * bounds.width;

    event.preventDefault();
    dragRef.current = {
      pointerId: event.pointerId,
      side,
      offset: target ? event.clientX - thumbCenter : 0,
    };
    setActiveThumb(side);
    if (target instanceof HTMLButtonElement) target.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    if (!target) updateFromPointer(event.clientX, side);
  }

  function handlePointerMove(event) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    updateFromPointer(event.clientX, drag.side, drag.offset);
  }

  function endPointerDrag(event) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleLostPointerCapture(event) {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  }

  function handleThumbKeyDown(side, event) {
    const current = side === 'lower' ? lower : upper;
    const min = side === 'lower' ? range.min : lower;
    const max = side === 'lower' ? upper : range.max;
    const keySteps = {
      ArrowDown: -range.step,
      ArrowLeft: -range.step,
      ArrowUp: range.step,
      ArrowRight: range.step,
      PageDown: -range.step * 10,
      PageUp: range.step * 10,
    };
    let next = current;
    if (event.key in keySteps) next += keySteps[event.key];
    else if (event.key === 'Home') next = min;
    else if (event.key === 'End') next = max;
    else return;

    event.preventDefault();
    next = Math.max(min, Math.min(max, next));
    onChange({ ...value, [side === 'lower' ? lowerKey : upperKey]: next });
    setActiveThumb(side);
  }

  return (
    <div className="filter-section range-filter">
      <div className="range-label">
        <label className="filter-label" htmlFor={lowerId}>{label}</label>
        <span className="range-value selectable-text">{describeRange(lower, upper, range, formatValue)}</span>
      </div>
      <div
        className="dual-range"
        style={{ '--range-start': `${toPercent(lower)}%`, '--range-end': `${toPercent(upper)}%` }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endPointerDrag}
        onPointerCancel={endPointerDrag}
        onLostPointerCapture={handleLostPointerCapture}
      >
        <div className="dual-range-track" ref={trackRef}>
          <span className="dual-range-fill" aria-hidden="true" />
          <button
            className={`dual-range-thumb is-lower${activeThumb === 'lower' ? ' is-active' : ''}`}
            id={lowerId}
            type="button"
            role="slider"
            data-range-thumb="lower"
            style={{ left: `${toPercent(lower)}%` }}
            aria-label={`${label} 이상`}
            aria-valuemin={range.min}
            aria-valuemax={upper}
            aria-valuenow={lower}
            aria-valuetext={`${formatValue(lower)} 이상`}
            aria-orientation="horizontal"
            onKeyDown={(event) => handleThumbKeyDown('lower', event)}
          />
          <button
            className={`dual-range-thumb is-upper${activeThumb === 'upper' ? ' is-active' : ''}`}
            id={upperId}
            type="button"
            role="slider"
            data-range-thumb="upper"
            style={{ left: `${toPercent(upper)}%` }}
            aria-label={`${label} 이하`}
            aria-valuemin={lower}
            aria-valuemax={range.max}
            aria-valuenow={upper}
            aria-valuetext={`${formatValue(upper)} 이하`}
            aria-orientation="horizontal"
            onKeyDown={(event) => handleThumbKeyDown('upper', event)}
          />
        </div>
      </div>
      <div className="range-ends"><span className="selectable-text">{lowerHint}</span><span className="selectable-text">{upperHint}</span></div>
    </div>
  );
}

export default function FilterPanel({
  value,
  onChange,
  locationOptions,
  locationsLoading,
  onReset,
  onApply,
  onClose,
  mobile = false,
}) {
  const [showExtraScores, setShowExtraScores] = useState(() => EXTRA_SCORE_FIELDS.some((field) => {
    const name = capitalize(field);
    return Number(value['start' + name] ?? FILTER_RANGES.score.min) > FILTER_RANGES.score.min
      || Number(value['end' + name] ?? FILTER_RANGES.score.max) < FILTER_RANGES.score.max;
  }));
  const area = value.areas?.[0] || '';
  const selectedLocation = value.locations?.[0] || '';
  const areas = [...new Set(locationOptions.map((item) => item.area).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'ko'));
  const locations = [...new Set(
    locationOptions
      .filter((item) => !area || item.area === area)
      .map((item) => item.location)
      .filter(Boolean),
  )].sort((a, b) => a.localeCompare(b, 'ko'));
  const idPrefix = mobile ? 'mobile' : 'desktop';
  const extraScoresId = `${idPrefix}-extra-score-filters`;

  const update = (key, nextValue) => onChange({ ...value, [key]: nextValue });
  const updateArea = (nextArea) => onChange({
    ...value,
    areas: nextArea ? [nextArea] : [],
    locations: [],
  });
  const updateLocation = (nextLocation) => update('locations', nextLocation ? [nextLocation] : []);

  function renderScoreFilter(filterKey) {
    const label = SCORE_LABELS[filterKey];
    return (
      <RangeFilter
        key={filterKey}
        filterKey={filterKey}
        label={label}
        value={value}
        range={FILTER_RANGES.score}
        idPrefix={idPrefix}
        formatValue={scoreText}
        lowerHint={filterKey === 'difficulty' ? '쉬운 편' : filterKey === 'fear' ? '무섭지 않게' : '0.0점'}
        upperHint={filterKey === 'difficulty' ? '도전적인 편' : filterKey === 'fear' ? '오싹하게' : '5.0점'}
        onChange={onChange}
      />
    );
  }

  return (
    <div className={mobile ? 'filter-panel is-mobile' : 'filter-panel'}>
      <div className="filter-panel-header">
        <div className="filter-heading">
          <div>
            <h2>필터</h2>
          </div>
        </div>
        {mobile ? (
          <button type="button" className="icon-button" onClick={onClose} aria-label="필터 닫기">
            <X size={19} />
          </button>
        ) : null}
      </div>

      <div className="filter-section">
        <label className="filter-label" htmlFor={`${idPrefix}-area`}>지역</label>
        <select
          id={`${idPrefix}-area`}
          value={area}
          onChange={(event) => updateArea(event.target.value)}
          disabled={locationsLoading || areas.length === 0}
        >
          <option value="">{locationsLoading ? '지역 불러오는 중…' : '전국'}</option>
          {areas.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <label className="filter-label filter-label-secondary" htmlFor={`${idPrefix}-location`}>
          동네
        </label>
        <select
          id={`${idPrefix}-location`}
          value={selectedLocation}
          onChange={(event) => updateLocation(event.target.value)}
          disabled={!area || locations.length === 0}
        >
          <option value="">{area ? '전체 동네' : '지역을 먼저 선택해 주세요'}</option>
          {locations.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </div>

      {PRIMARY_SCORE_FIELDS.map(renderScoreFilter)}

      <div className={showExtraScores ? 'filter-section score-more-section is-expanded' : 'filter-section score-more-section'}>
        <button
          type="button"
          className="score-expand-button"
          aria-expanded={showExtraScores}
          aria-controls={extraScoresId}
          onClick={() => setShowExtraScores((open) => !open)}
        >
          <span>{showExtraScores ? '접기' : '더보기'}</span>
          <ChevronDown size={16} aria-hidden="true" />
        </button>
        <div
          className={showExtraScores ? 'extra-score-filters is-expanded' : 'extra-score-filters'}
          id={extraScoresId}
          aria-hidden={!showExtraScores}
          inert={!showExtraScores}
        >
          <div className="extra-score-filters-inner">
            {EXTRA_SCORE_FIELDS.map(renderScoreFilter)}
          </div>
        </div>
      </div>

      <RangeFilter
        filterKey="price"
        label="가격"
        value={value}
        range={FILTER_RANGES.price}
        idPrefix={idPrefix}
        formatValue={priceText}
        lowerHint={priceText(FILTER_RANGES.price.min)}
        upperHint={priceText(FILTER_RANGES.price.max)}
        onChange={onChange}
      />
      <RangeFilter
        filterKey="playtime"
        label="플레이 시간"
        value={value}
        range={FILTER_RANGES.playtime}
        idPrefix={idPrefix}
        formatValue={playtimeText}
        lowerHint={playtimeText(FILTER_RANGES.playtime.min)}
        upperHint={playtimeText(FILTER_RANGES.playtime.max)}
        onChange={onChange}
      />

      <label className="open-only">
        <span className="open-only-copy">
          <strong>미운영 테마 포함</strong>
        </span>
        <input
          type="checkbox"
          checked={Boolean(value.includeClosed)}
          onChange={(event) => update('includeClosed', event.target.checked)}
        />
        <span className="switch" aria-hidden="true" />
      </label>

      <div className="filter-panel-footer">
        <button type="button" className="text-button" onClick={() => onReset({ ...DEFAULT_FILTERS, areas: [], locations: [] })}>
          <RotateCcw size={14} /> 초기화
          {countActiveFilters(value) > 0 ? <span className="filter-count">{countActiveFilters(value)}</span> : null}
        </button>
        {onApply ? (
          <button type="button" className="button button-primary apply-button" onClick={onApply}>
            적용
          </button>
        ) : null}
      </div>
    </div>
  );
}
