const API_ORIGIN = 'https://apisis.dev';
const CACHE_LIMIT = 160;
const DEFAULT_CACHE_MS = 45_000;
const LOCATION_CACHE_MS = 3_600_000;
const DETAIL_CACHE_MS = 300_000;
const MAX_REQUESTS_PER_MINUTE = 45;

const sortOptions = new Set([
  'createDate,desc',
  'createDate,asc',
  'name,asc',
  'satisfy,desc',
  'difficulty,desc',
  'difficulty,asc',
  'fear,desc',
  'fear,asc',
  'activity,desc',
  'story,desc',
  'problem,desc',
  'interior,desc',
  'act,desc',
  'playtime,asc',
  'playtime,desc',
  'price,asc',
  'price,desc',
]);

const scoreFields = [
  'Act',
  'Activity',
  'Difficulty',
  'Fear',
  'Interior',
  'Problem',
  'Satisfy',
  'Story',
];

const integerRanges = {
  startPlaytime: [0, 300],
  endPlaytime: [0, 300],
  startPrice: [0, 500_000],
  endPrice: [0, 500_000],
};

function sendJson(response, status, body, extraHeaders = {}) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...extraHeaders,
  });
  response.end(JSON.stringify(body));
}

function readList(url, name, maximum = 8) {
  const values = url.searchParams.getAll(name);
  if (values.length > maximum) {
    throw new Error('검색 지역은 최대 ' + maximum + '개까지 선택할 수 있어요.');
  }
  return values.map((value) => value.trim()).filter(Boolean);
}

function readNumber(url, name, minimum, maximum, integer = false) {
  const raw = url.searchParams.get(name);
  if (raw == null || raw === '') return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < minimum || value > maximum || (integer && !Number.isInteger(value))) {
    throw new Error('검색 조건 값이 올바르지 않아요.');
  }
  return value;
}

export function buildThemeSearchUrl(requestUrl) {
  const incoming = new URL(requestUrl, 'http://localhost');
  const outgoing = new URL('/api/escape/themes', API_ORIGIN);
  const search = incoming.searchParams.get('search')?.trim() ?? '';
  if (search.length > 80) throw new Error('검색어는 80자 이내로 입력해 주세요.');
  if (search) outgoing.searchParams.set('search', search);

  for (const name of ['areas', 'locations']) {
    for (const value of readList(incoming, name)) {
      if (value.length > 60 || /[\u0000-\u001f]/u.test(value)) {
        throw new Error('지역 검색 조건이 올바르지 않아요.');
      }
      outgoing.searchParams.append(name, value);
    }
  }

  const onlyOpen = incoming.searchParams.get('onlyOpen');
  if (onlyOpen != null) {
    if (onlyOpen !== 'true' && onlyOpen !== 'false') throw new Error('영업 상태 조건이 올바르지 않아요.');
    if (onlyOpen === 'true') outgoing.searchParams.set('onlyOpen', onlyOpen);
  }

  for (const field of scoreFields) {
    const lower = 'start' + field;
    const upper = 'end' + field;
    for (const name of [lower, upper]) {
      const value = readNumber(incoming, name, 0, 5);
      if (value != null) outgoing.searchParams.set(name, String(value));
    }
    const low = Number(outgoing.searchParams.get(lower));
    const high = Number(outgoing.searchParams.get(upper));
    if (outgoing.searchParams.has(lower) && outgoing.searchParams.has(upper) && low > high) {
      throw new Error('점수 범위가 올바르지 않아요.');
    }
  }

  for (const [name, [minimum, maximum]] of Object.entries(integerRanges)) {
    const value = readNumber(incoming, name, minimum, maximum, true);
    if (value != null) outgoing.searchParams.set(name, String(value));
  }

  for (const [lower, upper] of [['startPlaytime', 'endPlaytime'], ['startPrice', 'endPrice']]) {
    if (
      outgoing.searchParams.has(lower)
      && outgoing.searchParams.has(upper)
      && Number(outgoing.searchParams.get(lower)) > Number(outgoing.searchParams.get(upper))
    ) {
      throw new Error('가격 또는 시간 범위가 올바르지 않아요.');
    }
  }

  const page = readNumber(incoming, 'page', 0, 2_000, true) ?? 0;
  const size = readNumber(incoming, 'size', 1, 50, true) ?? 20;
  const sort = incoming.searchParams.get('sort') ?? 'createDate,desc';
  if (!sortOptions.has(sort)) throw new Error('지원하지 않는 정렬 방식이에요.');
  outgoing.searchParams.set('page', String(page));
  outgoing.searchParams.set('size', String(size));
  outgoing.searchParams.set('sort', sort);
  return outgoing;
}

function routeFor(pathname) {
  if (pathname === '/api/escape/themes') {
    return { urlPath: '/api/escape/themes', cacheMs: DEFAULT_CACHE_MS, kind: 'page' };
  }
  if (pathname === '/api/escape/locations') {
    return { urlPath: '/api/escape/cafes/location', cacheMs: LOCATION_CACHE_MS, kind: 'locations' };
  }

  const theme = pathname.match(/^\/api\/escape\/themes\/([0-9]+)$/u);
  if (theme) {
    return { urlPath: '/api/escape/themes/' + theme[1], cacheMs: DETAIL_CACHE_MS, kind: 'theme' };
  }

  const cafe = pathname.match(/^\/api\/escape\/cafes\/([A-Za-z0-9._-]{1,100})$/u);
  if (cafe) {
    return { urlPath: '/api/escape/cafes/' + encodeURIComponent(cafe[1]), cacheMs: DETAIL_CACHE_MS, kind: 'cafe' };
  }
  return null;
}

function validPayload(payload, kind) {
  if (kind === 'page') return payload && Array.isArray(payload.content);
  if (kind === 'locations') return Array.isArray(payload) || Array.isArray(payload.items);
  return payload != null && typeof payload === 'object' && !Array.isArray(payload);
}

function requestKey(request) {
  return request.socket?.remoteAddress || 'unknown';
}

export function createEscapeApi({
  apiKey = process.env.ROOM_SEARCH_API_KEY,
  fetchImpl = globalThis.fetch,
  now = () => Date.now(),
  cache = new Map(),
  rateLimits = new Map(),
} = {}) {
  return async function handleApi(request, response) {
    const incoming = new URL(request.url ?? '/', 'http://localhost');
    if (incoming.pathname === '/api/health') {
      return sendJson(response, 200, { ok: true, apiConfigured: Boolean(apiKey) });
    }
    if (!incoming.pathname.startsWith('/api/escape/')) {
      return sendJson(response, 404, { message: '요청한 API를 찾을 수 없어요.' });
    }
    if (request.method !== 'GET') {
      return sendJson(response, 405, { message: '읽기 요청만 지원해요.' }, { allow: 'GET' });
    }

    let target;
    try {
      target = routeFor(incoming.pathname);
      if (!target) return sendJson(response, 404, { message: '요청한 API를 찾을 수 없어요.' });
      if (target.kind === 'page') {
        const searchUrl = buildThemeSearchUrl(request.url ?? '/api/escape/themes');
        target.search = searchUrl.search;
      }
    } catch (error) {
      return sendJson(response, 400, { message: error.message || '검색 조건이 올바르지 않아요.' });
    }

    if (!apiKey) {
      return sendJson(response, 503, {
        message: '검색 API 키가 설정되지 않았어요. 운영 환경의 ROOM_SEARCH_API_KEY를 확인해 주세요.',
        code: 'API_KEY_MISSING',
      });
    }

    const requestTime = now();
    const address = requestKey(request);
    const recent = rateLimits.get(address) ?? [];
    const activeRequests = recent.filter((time) => requestTime - time < 60_000);
    if (activeRequests.length >= MAX_REQUESTS_PER_MINUTE) {
      rateLimits.set(address, activeRequests);
      return sendJson(response, 429, { message: '검색 요청이 잠시 많아요. 조금만 기다렸다 다시 시도해 주세요.' }, {
        'retry-after': '60',
      });
    }
    activeRequests.push(requestTime);
    rateLimits.set(address, activeRequests);

    const upstreamUrl = new URL(target.urlPath, API_ORIGIN);
    if (target.kind === 'page') upstreamUrl.search = target.search;
    const cached = cache.get(upstreamUrl.href);
    if (cached && cached.expiresAt > requestTime) {
      return sendJson(response, 200, cached.body, { 'x-room-search-cache': 'HIT' });
    }

    try {
      const upstream = await fetchImpl(upstreamUrl, {
        method: 'GET',
        headers: {
          accept: 'application/json',
          'X-API-Key': apiKey,
        },
        signal: AbortSignal.timeout(9_000),
      });
      if (!upstream.ok) {
        const status = upstream.status === 429 ? 429 : 502;
        const message = upstream.status === 429
          ? '검색 요청 한도에 도달했어요. 잠시 후 다시 시도해 주세요.'
          : '검색 서버와 연결하지 못했어요. 잠시 후 다시 시도해 주세요.';
        return sendJson(response, status, { message }, upstream.status === 429 ? { 'retry-after': '60' } : {});
      }
      const envelope = await upstream.json();
      const payload = envelope && typeof envelope === 'object' && 'payload' in envelope
        ? envelope.payload
        : envelope;
      if (!validPayload(payload, target.kind)) {
        return sendJson(response, 502, { message: '검색 서버가 예상과 다른 응답을 보냈어요.' });
      }
      cache.set(upstreamUrl.href, { body: payload, expiresAt: requestTime + target.cacheMs });
      if (cache.size > CACHE_LIMIT) {
        const oldest = cache.keys().next().value;
        if (oldest) cache.delete(oldest);
      }
      return sendJson(response, 200, payload, { 'x-room-search-cache': 'MISS' });
    } catch {
      return sendJson(response, 502, { message: '검색 서버에 연결하지 못했어요. 네트워크를 확인하고 다시 시도해 주세요.' });
    }
  };
}
