export const SCORE_FILTER_FIELDS = Object.freeze([
  'difficulty',
  'fear',
  'activity',
  'story',
  'problem',
  'interior',
  'act',
  'satisfy',
]);

export const FILTER_RANGES = Object.freeze({
  score: Object.freeze({ min: 0, max: 5, step: 0.5 }),
  price: Object.freeze({ min: 0, max: 200_000, step: 5_000 }),
  playtime: Object.freeze({ min: 0, max: 250, step: 5 }),
});

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

const scoreDefaults = Object.fromEntries(
  SCORE_FILTER_FIELDS.flatMap((field) => {
    const name = capitalize(field);
    return [['start' + name, FILTER_RANGES.score.min], ['end' + name, FILTER_RANGES.score.max]];
  }),
);

export const DEFAULT_FILTERS = Object.freeze({
  areas: [],
  locations: [],
  includeClosed: false,
  ...scoreDefaults,
  startPrice: FILTER_RANGES.price.min,
  endPrice: FILTER_RANGES.price.max,
  startPlaytime: FILTER_RANGES.playtime.min,
  endPlaytime: FILTER_RANGES.playtime.max,
});

function readBounds(filters, field, maximum, legacyMaximumField) {
  const name = capitalize(field);
  const rawStart = filters['start' + name];
  const rawEnd = filters['end' + name];
  const legacyEnd = filters[legacyMaximumField];
  const normalize = (value, fallback) => {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, Math.min(maximum, number)) : fallback;
  };
  const start = normalize(rawStart ?? 0, 0);
  const end = normalize(rawEnd != null && rawEnd !== ''
    ? rawEnd
    : legacyEnd != null && legacyEnd !== '' ? legacyEnd : maximum, maximum);
  return [start, Math.max(start, end)];
}

function isRangeActive(bounds, range) {
  return bounds[0] > range.min || bounds[1] < range.max;
}

function includesClosedThemes(filters) {
  if (filters.includeClosed != null) return Boolean(filters.includeClosed);
  return !Boolean(filters.onlyOpen);
}

function addRangeParams(params, filters, field, range, legacyMaximumField, includeDefaultEnd = false) {
  const name = capitalize(field);
  const [start, end] = readBounds(filters, field, range.max, legacyMaximumField);
  if (start > range.min) params.set('start' + name, String(start));
  if (end < range.max || includeDefaultEnd) params.set('end' + name, String(end));
}

export function buildThemeSearchParams({
  search = '',
  filters = DEFAULT_FILTERS,
  sort = 'createDate,desc',
  page = 0,
  size = 20,
} = {}) {
  const params = new URLSearchParams();
  const query = String(search).trim();
  if (query) params.set('search', query);
  for (const area of filters.areas || []) {
    if (area) params.append('areas', area);
  }
  for (const location of filters.locations || []) {
    if (location) params.append('locations', location);
  }
  if (!includesClosedThemes(filters)) params.set('onlyOpen', 'true');

  for (const field of SCORE_FILTER_FIELDS) {
    addRangeParams(params, filters, field, FILTER_RANGES.score, 'max' + capitalize(field));
  }
  addRangeParams(params, filters, 'price', FILTER_RANGES.price, 'maxPrice', true);
  addRangeParams(params, filters, 'playtime', FILTER_RANGES.playtime, 'maxPlaytime', true);

  params.set('page', String(Math.max(0, Number(page) || 0)));
  params.set('size', String(Math.min(50, Math.max(1, Number(size) || 20))));
  params.set('sort', sort);
  return params;
}

export function countActiveFilters(filters = DEFAULT_FILTERS) {
  const activeScores = SCORE_FILTER_FIELDS.filter((field) => (
    isRangeActive(readBounds(filters, field, FILTER_RANGES.score.max, 'max' + capitalize(field)), FILTER_RANGES.score)
  )).length;
  const activePrice = isRangeActive(readBounds(filters, 'price', FILTER_RANGES.price.max, 'maxPrice'), FILTER_RANGES.price);
  const activePlaytime = isRangeActive(readBounds(filters, 'playtime', FILTER_RANGES.playtime.max, 'maxPlaytime'), FILTER_RANGES.playtime);
  const includeClosedActive = filters.includeClosed != null
    ? Boolean(filters.includeClosed)
    : Boolean(filters.onlyOpen);

  return [
    (filters.areas || []).length > 0,
    (filters.locations || []).length > 0,
    includeClosedActive,
    activeScores > 0 ? activeScores : false,
    activePrice,
    activePlaytime,
  ].filter(Boolean).length;
}

function matchesRange(value, bounds, range) {
  const active = isRangeActive(bounds, range);
  if (value == null || value === '') return !active;
  const number = Number(value);
  if (!Number.isFinite(number)) return !active;
  return number >= bounds[0] && number <= bounds[1];
}

export function filterFavoriteThemes(themes, { search = '', filters = DEFAULT_FILTERS } = {}) {
  const query = String(search).trim().toLocaleLowerCase('ko-KR');
  return (themes || []).filter((theme) => {
    if (query) {
      const haystack = [theme.name, theme.cafeName].filter(Boolean).join(' ').toLocaleLowerCase('ko-KR');
      if (!haystack.includes(query)) return false;
    }
    if (!includesClosedThemes(filters) && !theme.isOpen) return false;

    for (const field of SCORE_FILTER_FIELDS) {
      const score = field === 'satisfy' ? (theme.review?.average ?? theme.satisfy) : theme[field];
      const bounds = readBounds(filters, field, FILTER_RANGES.score.max, 'max' + capitalize(field));
      if (!matchesRange(score, bounds, FILTER_RANGES.score)) return false;
    }

    if (!matchesRange(
      theme.price,
      readBounds(filters, 'price', FILTER_RANGES.price.max, 'maxPrice'),
      FILTER_RANGES.price,
    )) return false;
    if (!matchesRange(
      theme.playtime,
      readBounds(filters, 'playtime', FILTER_RANGES.playtime.max, 'maxPlaytime'),
      FILTER_RANGES.playtime,
    )) return false;
    if (filters.areas?.length && !filters.areas.includes(theme.sourceArea || '')) return false;
    if (filters.locations?.length && !filters.locations.includes(theme.sourceLocation || '')) return false;
    return true;
  });
}

export function filterThemesByDifficulty(themes, filters = DEFAULT_FILTERS) {
  const bounds = readBounds(filters, 'difficulty', FILTER_RANGES.score.max, 'maxDifficulty');
  return (themes || []).filter((theme) => matchesRange(theme.difficulty, bounds, FILTER_RANGES.score));
}

export function hasDifficultyFilter(filters = DEFAULT_FILTERS) {
  const bounds = readBounds(filters, 'difficulty', FILTER_RANGES.score.max, 'maxDifficulty');
  return isRangeActive(bounds, FILTER_RANGES.score);
}
