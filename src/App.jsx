import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Check,
  Heart,
  Moon,
  Search,
  SlidersHorizontal,
  Sun,
  X,
} from 'lucide-react';
import FilterPanel from './components/FilterPanel.jsx';
import LegalPage from './components/LegalPage.jsx';
import ThemeCard from './components/ThemeCard.jsx';
import ThemeDialog from './components/ThemeDialog.jsx';
import { getCafeDetail, getLocations, getThemeDetail, searchThemes } from './lib/api.js';
import {
  DEFAULT_FILTERS,
  buildThemeSearchParams,
  countActiveFilters,
  filterFavoriteThemes,
  filterThemesByDifficulty,
  hasDifficultyFilter,
} from './lib/filters.js';

const SORT_OPTIONS = [
  ['createDate,desc', '최신순'],
  ['satisfy,desc', '만족도 높은순'],
  ['difficulty,asc', '쉬운 순'],
  ['difficulty,desc', '난이도 높은순'],
  ['fear,asc', '공포도 낮은순'],
  ['fear,desc', '공포도 높은순'],
  ['activity,desc', '활동성 높은순'],
  ['story,desc', '스토리 높은순'],
  ['playtime,asc', '플레이타임 짧은순'],
  ['playtime,desc', '플레이타임 긴순'],
  ['price,asc', '가격 낮은순'],
  ['price,desc', '가격 높은순'],
  ['name,asc', '이름순'],
];

const PAGE_SIZE = 20;
const API_PAGE_SIZE = 50;
const FAVORITES_KEY = 'room-search.favorites.v1';
const THEME_KEY = 'room-search.theme.v1';

function readFavorites() {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function readThemeMode() {
  try {
    return localStorage.getItem(THEME_KEY) === 'dark';
  } catch {
    return false;
  }
}

function sortThemes(themes, sort) {
  const [field, direction] = String(sort).split(',');
  const factor = direction === 'asc' ? 1 : -1;
  return [...themes].sort((a, b) => {
    const left = field === 'satisfy' ? (a.review?.average ?? a.satisfy) : a[field];
    const right = field === 'satisfy' ? (b.review?.average ?? b.satisfy) : b[field];
    if (field === 'name') return String(left || '').localeCompare(String(right || ''), 'ko') * factor;
    if (field === 'createDate') return String(left || '').localeCompare(String(right || '')) * factor;
    return ((Number(left) || 0) - (Number(right) || 0)) * factor;
  });
}

function getInitialSharedTheme() {
  return new URLSearchParams(window.location.search).get('theme');
}

function SearchApp() {
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState({ ...DEFAULT_FILTERS, areas: [], locations: [] });
  const [sort, setSort] = useState('createDate,desc');
  const [pageNumber, setPageNumber] = useState(0);
  const [visibleLimit, setVisibleLimit] = useState(PAGE_SIZE);
  const [pageRetry, setPageRetry] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState('');
  const [resultsNavKey, setResultsNavKey] = useState(0);
  const [refreshId, setRefreshId] = useState(0);
  const [pageData, setPageData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [locationOptions, setLocationOptions] = useState([]);
  const [locationsLoading, setLocationsLoading] = useState(true);
  const [favorites, setFavorites] = useState(readFavorites);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [selectedTheme, setSelectedTheme] = useState(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterDraft, setFilterDraft] = useState(filters);
  const [toast, setToast] = useState('');
  const [darkMode, setDarkMode] = useState(readThemeMode);
  const searchRef = useRef(null);
  const filterTriggerRef = useRef(null);
  const filterDialogRef = useRef(null);
  const resultsRef = useRef(null);
  const loadMoreRef = useRef(null);
  const loadMoreInFlight = useRef(false);
  const loadedThemeIds = useRef(new Set());
  const previousToast = useRef(null);
  const hasLoadedResults = useRef(false);

  const favoriteCount = Object.keys(favorites).length;
  const favoritesList = useMemo(() => {
    const filtered = filterFavoriteThemes(Object.values(favorites), { search: query, filters });
    return sortThemes(filtered, sort);
  }, [favorites, filters, query, sort]);
  const difficultyFilterActive = hasDifficultyFilter(filters);
  const difficultyMatches = useMemo(
    () => filterThemesByDifficulty(pageData?.content || [], filters),
    [filters, pageData],
  );
  const visibleThemes = favoritesOnly
    ? favoritesList.slice(0, (pageNumber + 1) * PAGE_SIZE)
    : difficultyFilterActive ? difficultyMatches.slice(0, visibleLimit) : pageData?.content || [];
  const totalElements = favoritesOnly
    ? favoritesList.length
    : difficultyFilterActive ? difficultyMatches.length : (pageData?.totalElements || 0);
  const hasMoreResults = favoritesOnly
    ? visibleThemes.length < favoritesList.length
    : difficultyFilterActive
      ? difficultyMatches.length > visibleLimit || hasMore
      : hasMore;
  const difficultySearchPending = !favoritesOnly
    && difficultyFilterActive
    && difficultyMatches.length === 0
    && hasMoreResults;
  const activeFilterCount = useMemo(() => countActiveFilters(filters), [filters]);

  const loadNextPage = useCallback(() => {
    if (
      loadMoreInFlight.current
      || loading
      || loadingMore
      || loadMoreError
      || error
      || !hasMoreResults
      || (!favoritesOnly && !pageData)
    ) return;
    loadMoreInFlight.current = true;
    setLoadingMore(true);
    if (!favoritesOnly) setLoadMoreError('');
    if (!favoritesOnly && difficultyFilterActive && difficultyMatches.length > visibleLimit) {
      setVisibleLimit((current) => current + PAGE_SIZE);
      setLoadingMore(false);
      loadMoreInFlight.current = false;
      return;
    }
    setPageNumber((current) => current + 1);
  }, [difficultyFilterActive, difficultyMatches.length, error, favoritesOnly, hasMoreResults, loading, loadingMore, loadMoreError, pageData, visibleLimit]);

  const notify = useCallback((message) => {
    setToast(message);
    if (previousToast.current) window.clearTimeout(previousToast.current);
    previousToast.current = window.setTimeout(() => setToast(''), 2_600);
  }, []);

  const updateFilters = useCallback((next) => {
    setFilters(next);
    setPageNumber(0);
    if (!favoritesOnly) {
      setLoading(true);
      setHasMore(true);
    }
  }, [favoritesOnly]);

  useEffect(() => {
    document.documentElement.dataset.theme = darkMode ? 'dark' : 'light';
    try {
      localStorage.setItem(THEME_KEY, darkMode ? 'dark' : 'light');
    } catch {
      // Theme selection still applies for the current page when storage is unavailable.
    }
  }, [darkMode]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    getLocations(controller.signal)
      .then((result) => {
        if (active) setLocationOptions(result.filter((item) => item?.area && item?.location));
      })
      .catch(() => {
        if (active) setLocationOptions([]);
      })
      .finally(() => {
        if (active) setLocationsLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  useEffect(() => {
    if (favoritesOnly) {
      setLoading(false);
      setError('');
      setLoadingMore(false);
      setLoadMoreError('');
      loadMoreInFlight.current = false;
      return undefined;
    }
    const controller = new AbortController();
    let active = true;
    const isFirstPage = pageNumber === 0;
    if (isFirstPage) {
      setVisibleLimit(PAGE_SIZE);
      setLoading(true);
      setLoadingMore(false);
      setError('');
      setLoadMoreError('');
      setHasMore(true);
      loadedThemeIds.current = new Set();
      loadMoreInFlight.current = false;
    } else {
      setLoading(false);
      setLoadingMore(true);
      setLoadMoreError('');
      loadMoreInFlight.current = true;
    }
    const requestSize = difficultyFilterActive ? API_PAGE_SIZE : PAGE_SIZE;
    const params = buildThemeSearchParams({ search: query, filters, sort, page: pageNumber, size: requestSize });
    const delay = isFirstPage && hasLoadedResults.current ? 280 : 0;
    const timer = window.setTimeout(() => {
      searchThemes(params, controller.signal)
        .then((result) => {
          if (!active) return;
          hasLoadedResults.current = true;
          const pageContent = Array.isArray(result.content) ? result.content : [];
          let newThemeCount = pageContent.length;
          if (isFirstPage) {
            loadedThemeIds.current = new Set(pageContent
              .map((theme) => (theme?.refId == null ? null : String(theme.refId)))
              .filter(Boolean));
            setPageData(result);
          } else {
            newThemeCount = 0;
            for (const theme of pageContent) {
              const id = theme?.refId == null ? null : String(theme.refId);
              if (!id || !loadedThemeIds.current.has(id)) newThemeCount += 1;
              if (id) loadedThemeIds.current.add(id);
            }
            setPageData((current) => {
              if (!current) return result;
              const content = [...(current.content || [])];
              const seenIds = new Set(content.map((theme) => (
                theme?.refId == null ? null : String(theme.refId)
              )).filter(Boolean));
              for (const theme of result.content || []) {
                const id = theme?.refId == null ? null : String(theme.refId);
                if (!id || !seenIds.has(id)) content.push(theme);
                if (id) seenIds.add(id);
              }
              return { ...current, ...result, content };
            });
          }
          const pageCount = Number(result.totalPages);
          const hasPageCount = Number.isFinite(pageCount) && result.totalPages != null;
          const pageCountHasMore = hasPageCount
            ? pageNumber + 1 < pageCount
            : pageContent.length >= requestSize;
          const responseIsFull = pageContent.length >= requestSize;
          const reportedTotal = Number(result.totalElements);
          const hasReportedTotal = Number.isFinite(reportedTotal) && result.totalElements != null;
          const reachedReportedTotal = !difficultyFilterActive
            && hasReportedTotal
            && loadedThemeIds.current.size >= reportedTotal;
          setHasMore(
            responseIsFull
            && pageCountHasMore
            && (isFirstPage || newThemeCount > 0)
            && !reachedReportedTotal,
          );
          setError('');
          setLoadMoreError('');
        })
        .catch((nextError) => {
          if (!active || nextError.name === 'AbortError') return;
          if (isFirstPage) {
            setError(nextError.message || '검색 정보를 불러오지 못했어요.');
          } else {
            setLoadMoreError(nextError.message || '다음 결과를 불러오지 못했어요.');
          }
        })
        .finally(() => {
          if (!active) return;
          if (isFirstPage) setLoading(false);
          setLoadingMore(false);
          loadMoreInFlight.current = false;
        });
    }, delay);
    return () => {
      active = false;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [difficultyFilterActive, favoritesOnly, filters, pageNumber, pageRetry, query, refreshId, sort]);

  useEffect(() => {
    if (
      typeof IntersectionObserver === 'undefined'
      || !loadMoreRef.current
      || !hasMoreResults
      || loading
      || loadingMore
      || loadMoreError
      || error
    ) return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) loadNextPage();
    }, { rootMargin: '480px 0px', threshold: 0 });
    observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [error, hasMoreResults, loadMoreError, loadNextPage, loading, loadingMore, visibleThemes.length]);

  useEffect(() => {
    if (resultsNavKey === 0) return undefined;
    const frame = window.requestAnimationFrame(() => {
      const results = resultsRef.current;
      if (!results) return;
      const { top } = results.getBoundingClientRect();
      if (top < 0 || top > window.innerHeight * 0.8) {
        results.scrollIntoView({ behavior: 'auto', block: 'start' });
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [resultsNavKey]);

  useEffect(() => {
    const refId = getInitialSharedTheme();
    if (!refId || !/^[0-9]+$/u.test(refId)) return undefined;
    const controller = new AbortController();
    getThemeDetail(refId, controller.signal)
      .then((theme) => setSelectedTheme(theme))
      .catch(() => notify('공유한 테마를 불러오지 못했어요.'));
    return () => controller.abort();
  }, [notify]);

  useEffect(() => {
    function handleGlobalKey(event) {
      const target = event.target;
      const editing = target instanceof HTMLElement
        && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
      if (event.key === '/' && !editing && !selectedTheme && !filterOpen) {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === 'Escape' && filterOpen) setFilterOpen(false);
    }
    window.addEventListener('keydown', handleGlobalKey);
    return () => window.removeEventListener('keydown', handleGlobalKey);
  }, [filterOpen, selectedTheme]);

  useEffect(() => {
    if (!filterOpen) return undefined;
    document.body.classList.add('has-modal');
    const frame = window.requestAnimationFrame(() => filterDialogRef.current?.focus());
    return () => {
      document.body.classList.remove('has-modal');
      window.cancelAnimationFrame(frame);
      filterTriggerRef.current?.focus();
    };
  }, [filterOpen]);

  useEffect(() => () => {
    if (previousToast.current) window.clearTimeout(previousToast.current);
  }, []);

  function handleOpenTheme(theme) {
    setSelectedTheme(theme);
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set('theme', String(theme.refId));
    window.history.replaceState({}, '', nextUrl);
  }

  function handleCloseTheme() {
    setSelectedTheme(null);
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.delete('theme');
    window.history.replaceState({}, '', nextUrl);
  }

  function handleFavorite(theme) {
    const id = String(theme.refId);
    if (!id || id === 'undefined') return;
    const next = { ...favorites };
    const removing = Boolean(next[id]);
    if (removing) {
      delete next[id];
    } else {
      next[id] = {
        ...theme,
        sourceArea: theme.sourceArea || filters.areas?.[0] || '',
        sourceLocation: theme.sourceLocation || filters.locations?.[0] || '',
      };
    }
    setFavorites(next);
    try {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
    } catch {
      notify('이 기기에 저장할 수 없어요. 저장 공간을 확인해 주세요.');
    }
    if (!removing && theme.escapeCafeId && (!theme.cafeName || !theme.sourceArea || !theme.sourceLocation)) {
      getCafeDetail(theme.escapeCafeId)
        .then((cafe) => {
          setFavorites((current) => {
            if (!current[id]) return current;
            const enriched = {
              ...current,
              [id]: {
                ...current[id],
                cafeName: cafe.name || current[id].cafeName || '',
                sourceArea: cafe.area || current[id].sourceArea || '',
                sourceLocation: cafe.location || current[id].sourceLocation || '',
              },
            };
            try {
              localStorage.setItem(FAVORITES_KEY, JSON.stringify(enriched));
            } catch {
              // Keep the metadata in this session when storage is unavailable.
            }
            return enriched;
          });
        })
        .catch(() => {});
    }
  }

  function openFilters() {
    setFilterDraft({ ...filters, areas: [...filters.areas], locations: [...filters.locations] });
    setFilterOpen(true);
  }

  function applyMobileFilters() {
    updateFilters(filterDraft);
    setFilterOpen(false);
  }

  function navigateToView(nextFavoritesOnly) {
    if (favoritesOnly === nextFavoritesOnly && pageNumber === 0) return;
    setFavoritesOnly(nextFavoritesOnly);
    setPageNumber(0);
    setResultsNavKey((value) => value + 1);
  }

  function retryLoadMore() {
    if (loadMoreInFlight.current) return;
    loadMoreInFlight.current = true;
    setLoadingMore(true);
    setLoadMoreError('');
    setPageRetry((value) => value + 1);
  }

  function submitSearch(event) {
    event.preventDefault();
    setPageNumber(0);
  }

  function clearSearch() {
    setQuery('');
    searchRef.current?.focus();
    setPageNumber(0);
  }

  function handleFilterDialogKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      setFilterOpen(false);
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [...filterDialogRef.current.querySelectorAll(
      'button:not([disabled]), a[href], select:not([disabled]), input:not([disabled])',
    )].filter((item) => item.offsetParent !== null);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  const emptyFavorite = favoritesOnly && favoriteCount === 0;
  const showNoResults = !loading && !error && !emptyFavorite && !hasMoreResults && visibleThemes.length === 0;
  const resultsCountText = loading && !favoritesOnly
    ? '불러오는 중'
    : difficultySearchPending
      ? '난이도에 맞는 테마를 찾는 중'
      : `${totalElements.toLocaleString('ko-KR')}${difficultyFilterActive && hasMoreResults ? '개 이상' : '개'}`;

  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="header-inner">
          <a className="brand" href="/" aria-label="룸서치 홈">
            <img src="/room-search-icon.png" alt="" width="36" height="36" />
            <span className="brand-word">룸서치</span>
          </a>
          <nav className="desktop-nav" aria-label="주요 메뉴">
            <button
              type="button"
              className={!favoritesOnly ? 'nav-link is-current' : 'nav-link'}
              onClick={() => navigateToView(false)}
            >
              테마 탐색
            </button>
            <button
              type="button"
              className={favoritesOnly ? 'nav-link is-current' : 'nav-link'}
              onClick={() => navigateToView(true)}
            >
              찜한 테마 <span className="nav-count">{favoriteCount}</span>
            </button>
          </nav>
          <div className="header-actions">
            <button
              type="button"
              className="icon-button theme-mode-button"
              onClick={() => setDarkMode((current) => !current)}
              aria-label={darkMode ? '라이트 모드로 변경' : '다크 모드로 변경'}
              title={darkMode ? '라이트 모드' : '다크 모드'}
            >
              {darkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>
        </div>
      </header>

      <main className="page-main">
        <section className="intro" aria-labelledby="page-title">
          <div className="intro-copy">
            <h1 id="page-title">방탈출 찾기</h1>
            <p>지역부터 난이도까지, 함께 갈 테마를 골라보세요</p>
          </div>
        </section>

        <section className="search-section" aria-label="방탈출 검색">
          <form className="search-form" onSubmit={submitSearch}>
            <Search className="search-icon" size={21} aria-hidden="true" />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(event) => { setQuery(event.target.value); setPageNumber(0); }}
              placeholder="테마명 또는 카페명"
              aria-label="테마명 또는 카페 검색"
              autoComplete="off"
            />
            {query ? (
              <button type="button" className="clear-search" onClick={clearSearch} aria-label="검색어 지우기">
                <X size={17} />
              </button>
            ) : (
              <kbd className="search-shortcut" aria-hidden="true">/</kbd>
            )}
            <button className="button button-primary search-submit" type="submit">
              <span>검색</span><ArrowRight size={17} />
            </button>
          </form>
        </section>

        <div className="browse-layout">
          <aside className="desktop-filter" aria-label="검색 필터">
            <FilterPanel
              value={filters}
              onChange={updateFilters}
              locationOptions={locationOptions}
              locationsLoading={locationsLoading}
              onReset={updateFilters}
            />
          </aside>

          <section
            key={favoritesOnly ? 'favorites' : 'themes'}
            className="results-section"
            aria-labelledby="results-title"
            ref={resultsRef}
          >
            <div className="results-topbar">
              <div className="results-heading">
                <div>
                  <h2 id="results-title">{favoritesOnly ? '찜한 테마' : '검색 결과'}</h2>
                  {!error ? (
                    <p className={loading && !favoritesOnly || loadingMore || difficultySearchPending ? 'loading-status' : undefined} aria-live="polite">
                      {resultsCountText}
                      {query ? <span> · {query}</span> : null}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="results-toolbar">
                <button
                  type="button"
                  className="mobile-filter-trigger"
                  onClick={openFilters}
                  ref={filterTriggerRef}
                >
                  <SlidersHorizontal size={16} /> 필터
                  {activeFilterCount > 0 ? <span>{activeFilterCount}</span> : null}
                </button>
                <div className="toolbar-controls">
                  <label htmlFor="sort-themes">정렬</label>
                  <select id="sort-themes" value={sort} onChange={(event) => { setSort(event.target.value); setPageNumber(0); }}>
                    {SORT_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {error ? (
              <div className="state-card error-card" role="alert">
                <div className="state-icon"><Search size={22} /></div>
                <h3>검색을 불러오지 못했어요</h3>
                <p>{error}</p>
                <button type="button" className="button button-secondary" onClick={() => setRefreshId((value) => value + 1)}>
                  다시 시도하기 <ArrowRight size={16} />
                </button>
              </div>
            ) : null}

            {emptyFavorite ? (
              <div className="state-card empty-card">
                <div className="state-icon"><Heart size={22} /></div>
                <h3>아직 찜한 테마가 없어요</h3>
                <p>마음에 드는 테마의 하트를 눌러 다음 계획을 담아두세요.</p>
                <button type="button" className="button button-primary" onClick={() => navigateToView(false)}>
                  전체 테마 <ArrowRight size={16} />
                </button>
              </div>
            ) : null}

            {!error && !emptyFavorite && loading && !pageData && !favoritesOnly ? (
              <div className="theme-grid" aria-label="테마 불러오는 중" aria-busy="true">
                {Array.from({ length: 6 }, (_, index) => (
                  <div className="theme-skeleton" key={index}>
                    <div className="skeleton-poster" />
                    <div className="skeleton-copy"><span /><span /><span /></div>
                  </div>
                ))}
              </div>
            ) : null}

            {showNoResults ? (
              <div className="state-card empty-card">
                <div className="state-icon"><Search size={22} /></div>
                <h3>조건에 맞는 테마가 없어요</h3>
                <p>검색어나 필터를 조금 바꾸면 더 많이 찾을 수 있어요.</p>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => {
                    setQuery('');
                    updateFilters({ ...DEFAULT_FILTERS, areas: [], locations: [] });
                    setRefreshId((value) => value + 1);
                  }}
                >
                  조건 초기화 <ArrowRight size={16} />
                </button>
              </div>
            ) : null}

            {!error && !emptyFavorite && visibleThemes.length > 0 ? (
              <div className={loading ? 'theme-grid is-updating' : 'theme-grid'}>
                {visibleThemes.map((theme, index) => {
                  const id = String(theme.refId);
                  return (
                    <ThemeCard
                      key={id || index}
                      theme={theme}
                      favorite={Boolean(favorites[id])}
                      onFavorite={handleFavorite}
                      onOpen={() => handleOpenTheme(theme)}
                    />
                  );
                })}
              </div>
            ) : null}

            {!error && !emptyFavorite && (visibleThemes.length > 0 || hasMoreResults) ? (
              <div className="infinite-scroll-footer">
                {hasMoreResults ? (
                  <div className="infinite-scroll-sentinel" ref={loadMoreRef} aria-hidden="true" />
                ) : (
                  <p className="infinite-scroll-end">모든 결과를 불러왔어요</p>
                )}
                {loadingMore ? (
                  <p className="infinite-scroll-loading" role="status">
                    {difficultySearchPending ? '난이도에 맞는 테마를 찾는 중' : '다음 결과를 불러오는 중'}
                  </p>
                ) : null}
                {loadMoreError ? (
                  <div className="infinite-scroll-error" role="alert">
                    <span>다음 결과를 불러오지 못했어요. {loadMoreError}</span>
                    <button type="button" className="button button-secondary" onClick={retryLoadMore}>
                      다시 시도 <ArrowRight size={15} />
                    </button>
                  </div>
                ) : null}
                {hasMoreResults && !loadingMore && !loadMoreError && typeof IntersectionObserver === 'undefined' ? (
                  <button type="button" className="button button-secondary" onClick={loadNextPage}>
                    더 불러오기 <ArrowRight size={15} />
                  </button>
                ) : null}
              </div>
            ) : null}

            <p className="results-footnote">가격과 운영 정보는 카페 사정에 따라 다를 수 있어요.</p>
          </section>
        </div>
      </main>

      <footer className="site-footer">
        <nav className="footer-policy-links" aria-label="정책 및 앱 안내">
          <a href="/privacy-policy">개인정보처리방침</a>
          <a href="/terms">이용약관</a>
          <a href="https://room-search.github.io/" target="_blank" rel="noopener noreferrer">안드로이드</a>
        </nav>
        <button
          type="button"
          className="footer-theme-button"
          onClick={() => setDarkMode((current) => !current)}
          aria-label={darkMode ? '라이트 모드로 변경' : '다크 모드로 변경'}
          title={darkMode ? '라이트 모드' : '다크 모드'}
        >
          {darkMode ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </footer>

      <nav className="mobile-bottom-nav" aria-label="모바일 메뉴">
        <button
          type="button"
          className={!favoritesOnly ? 'bottom-nav-item is-current' : 'bottom-nav-item'}
          onClick={() => navigateToView(false)}
        >
          <Search size={19} /><span>탐색</span>
        </button>
        <button
          type="button"
          className={favoritesOnly ? 'bottom-nav-item is-current' : 'bottom-nav-item'}
          onClick={() => navigateToView(true)}
        >
          <Heart size={19} fill={favoritesOnly ? 'currentColor' : 'none'} /><span>찜 {favoriteCount || ''}</span>
        </button>
      </nav>

      {filterOpen ? (
        <div className="filter-backdrop" onMouseDown={() => setFilterOpen(false)}>
          <section
            className="filter-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mobile-filter-heading"
            tabIndex="-1"
            ref={filterDialogRef}
            onMouseDown={(event) => event.stopPropagation()}
            onKeyDown={handleFilterDialogKeyDown}
          >
            <h2 id="mobile-filter-heading" className="sr-only">검색 필터 설정</h2>
            <FilterPanel
              mobile
              value={filterDraft}
              onChange={setFilterDraft}
              locationOptions={locationOptions}
              locationsLoading={locationsLoading}
              onReset={setFilterDraft}
              onApply={applyMobileFilters}
              onClose={() => setFilterOpen(false)}
            />
          </section>
        </div>
      ) : null}

      {selectedTheme ? (
        <ThemeDialog
          key={String(selectedTheme.refId)}
          theme={selectedTheme}
          favorite={Boolean(favorites[String(selectedTheme.refId)])}
          onFavorite={handleFavorite}
          onClose={handleCloseTheme}
          onToast={notify}
        />
      ) : null}

      <div className={toast ? 'toast is-visible' : 'toast'} role="status" aria-live="polite">
        <Check size={16} /> {toast}
      </div>
    </div>
  );
}

function App() {
  useEffect(() => {
    function preventUnneededDrag(event) {
      const target = event.target instanceof Element ? event.target : event.target?.parentElement;
      if (target?.closest('img, svg, a')) {
        event.preventDefault();
        return;
      }
      if (target?.closest('.selectable-text, input, textarea, [contenteditable="true"]')) return;
      const selection = document.getSelection();
      const selectionNodes = [selection?.anchorNode, selection?.focusNode].filter(Boolean);
      const selectionIsAllowed = selection
        && !selection.isCollapsed
        && selectionNodes.length === 2
        && selectionNodes.every((node) => {
          const element = node instanceof Element ? node : node.parentElement;
          return element?.closest('.selectable-text');
        });
      if (selectionIsAllowed) return;
      event.preventDefault();
    }

    document.addEventListener('dragstart', preventUnneededDrag, true);
    return () => document.removeEventListener('dragstart', preventUnneededDrag, true);
  }, []);

  const pathname = window.location.pathname.replace(/\/+$/u, '') || '/';
  if (pathname === '/privacy-policy') return <LegalPage page="privacy" />;
  if (pathname === '/terms') return <LegalPage page="terms" />;
  return <SearchApp />;
}

export default App;
