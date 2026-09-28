import assert from 'node:assert/strict';
import test from 'node:test';
import { buildThemeSearchParams, countActiveFilters, filterFavoriteThemes } from '../src/lib/filters.js';

test('search params keep repeated region keys and omit untouched filters', () => {
  const params = buildThemeSearchParams({
    search: '  미스터리  ',
    filters: {
      areas: ['서울', '부산'],
      locations: ['홍대'],
      onlyOpen: false,
      maxDifficulty: 5,
      maxFear: 5,
      maxPrice: '',
      maxPlaytime: '',
    },
  });
  assert.equal(params.get('search'), '미스터리');
  assert.deepEqual(params.getAll('areas'), ['서울', '부산']);
  assert.deepEqual(params.getAll('locations'), ['홍대']);
  assert.equal(params.has('onlyOpen'), false);
  assert.equal(params.has('endDifficulty'), false);
  assert.equal(params.get('page'), '0');
  assert.equal(params.get('size'), '20');
});

test('search params map active filters to the API field names', () => {
  const params = buildThemeSearchParams({
    filters: {
      areas: [],
      locations: [],
      onlyOpen: true,
      maxDifficulty: 3.5,
      maxFear: 2,
      maxPrice: 25000,
      maxPlaytime: 90,
    },
    sort: 'price,asc',
    page: 2,
  });
  assert.equal(params.get('onlyOpen'), 'true');
  assert.equal(params.get('endDifficulty'), '3.5');
  assert.equal(params.get('endFear'), '2');
  assert.equal(params.get('endPrice'), '25000');
  assert.equal(params.get('endPlaytime'), '90');
  assert.equal(params.get('sort'), 'price,asc');
  assert.equal(params.get('page'), '2');
});

test('active filter count reflects only selected conditions', () => {
  assert.equal(countActiveFilters({
    areas: ['서울'],
    locations: [],
    onlyOpen: true,
    maxDifficulty: 4,
    maxFear: 5,
    maxPrice: '',
    maxPlaytime: 90,
  }), 4);
});

test('saved themes can be filtered locally without an API request', () => {
  const themes = [
    { name: '비밀의 방', difficulty: 2, fear: 1, price: 18000, playtime: 60, isOpen: true },
    { name: '어둠 속으로', difficulty: 4.5, fear: 4.8, price: 25000, playtime: 90, isOpen: true },
  ];
  const matches = filterFavoriteThemes(themes, {
    search: '비밀',
    filters: { ...{
      areas: [],
      locations: [],
      onlyOpen: true,
      maxDifficulty: 3,
      maxFear: 2,
      maxPrice: 20000,
      maxPlaytime: 90,
    } },
  });
  assert.deepEqual(matches.map((theme) => theme.name), ['비밀의 방']);
});

test('saved themes support cafe search and area or neighborhood filters', () => {
  const themes = [
    { name: '비밀의 방', cafeName: '미스터리추리클럽', sourceArea: '경기/인천', sourceLocation: '안산' },
    { name: '조이', cafeName: '홍대이스케이프', sourceArea: '서울', sourceLocation: '홍대' },
  ];
  const filtered = filterFavoriteThemes(themes, {
    search: '미스터리',
    filters: {
      areas: ['경기/인천'],
      locations: ['안산'],
      onlyOpen: false,
      maxDifficulty: 5,
      maxFear: 5,
      maxPrice: '',
      maxPlaytime: '',
    },
  });
  assert.deepEqual(filtered.map((theme) => theme.name), ['비밀의 방']);
});
