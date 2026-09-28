import { readFile } from 'node:fs/promises';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import https from 'node:https';

const API_ORIGIN = 'https://apisis.dev';
const ROOM_SEARCH_LOGO_DATA_URI = 'data:image/png;base64,'
  + (await readFile(new URL('../public/room-search-icon.png', import.meta.url))).toString('base64');
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

function escapeXml(value) {
  return String(value).replace(/[&<>"']/gu, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&apos;',
  })[character]);
}

function cleanCardText(value, maximum = 80) {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  return Array.from(String(value).replace(/[\u0000-\u001f\u007f]/gu, ' ').trim()).slice(0, maximum).join('');
}

function cleanReviewText(value, maximum = 320) {
  if (typeof value !== 'string') return '';
  return Array.from(value
    .replace(/\r\n?/gu, '\n')
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/gu, '')
    .split('\n')
    .map((line) => line.replace(/[\t ]+/gu, ' ').trim())
    .join('\n'))
    .slice(0, maximum)
    .join('')
    .trim();
}

function readPhotoCardBody(body) {
  const themeId = String(body?.themeId ?? '');
  if (!/^\d{1,20}$/u.test(themeId)) throw new Error('테마 정보가 올바르지 않아요.');

  const playedOn = cleanCardText(body?.playedOn, 32);
  if (playedOn && !/^\d{4}-\d{2}-\d{2}$/u.test(playedOn)) {
    throw new Error('플레이 일자를 확인해 주세요.');
  }
  if (playedOn) {
    const parsed = new Date(playedOn + 'T00:00:00Z');
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== playedOn) {
      throw new Error('플레이 일자를 확인해 주세요.');
    }
  }

  const remainingTime = cleanCardText(body?.remainingTime, 24);
  const escapeResult = body?.escapeResult ?? '';
  if (!['', 'success', 'fail'].includes(escapeResult)) {
    throw new Error('탈출 결과를 확인해 주세요.');
  }
  const rawHintCount = body?.hintCount;
  let hintCount = '';
  if (rawHintCount !== '' && rawHintCount != null) {
    const parsed = Number(rawHintCount);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 99) {
      throw new Error('힌트 사용 수는 0부터 99까지 입력해 주세요.');
    }
    hintCount = String(parsed);
  }

  return {
    themeId,
    playedOn,
    remainingTime,
    escapeResult,
    hintCount,
    playerName: cleanCardText(body?.playerName, 24),
    review: cleanReviewText(body?.review),
    showThemeName: typeof body?.showThemeName === 'boolean' ? body.showThemeName : true,
  };
}

function getRasterDimensions(buffer, mimeType) {
  if (mimeType === 'image/png' && buffer.length >= 24) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (mimeType === 'image/jpeg') {
    let offset = 2;
    const startOfFrame = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = buffer[offset + 1];
      offset += 2;
      if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > buffer.length) break;
      const segmentLength = buffer.readUInt16BE(offset);
      if (segmentLength < 2 || offset + segmentLength > buffer.length) break;
      if (startOfFrame.has(marker) && segmentLength >= 7) {
        return {
          width: buffer.readUInt16BE(offset + 5),
          height: buffer.readUInt16BE(offset + 3),
        };
      }
      offset += segmentLength;
    }
  }
  if (mimeType === 'image/webp' && buffer.length >= 25 && buffer.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = buffer.toString('ascii', 12, 16);
    if (chunk === 'VP8X' && buffer.length >= 30) {
      return {
        width: 1 + buffer.readUIntLE(24, 3),
        height: 1 + buffer.readUIntLE(27, 3),
      };
    }
    if (chunk === 'VP8 ' && buffer.length >= 30) {
      return {
        width: buffer.readUInt16LE(26) & 0x3fff,
        height: buffer.readUInt16LE(28) & 0x3fff,
      };
    }
    if (chunk === 'VP8L' && buffer.length >= 25 && buffer[20] === 0x2f) {
      const bits = buffer.readUInt32LE(21);
      return {
        width: 1 + (bits & 0x3fff),
        height: 1 + ((bits >>> 14) & 0x3fff),
      };
    }
  }
  return { width: 2, height: 3 };
}

function measureSvgText(value) {
  return Array.from(value).reduce((total, character) => total + (/^[A-Z0-9 .,:'’()-]$/iu.test(character) ? 0.55 : 1), 0);
}

function wrapSvgText(value, maximumUnits, maximumLines) {
  if (!String(value)) return [];
  const lines = [];
  for (const paragraph of String(value).split('\n')) {
    const words = paragraph.split(/\s+/u).filter(Boolean);
    if (words.length === 0) {
      lines.push('');
      continue;
    }
    let line = '';
    for (const word of words) {
      const candidate = line ? line + ' ' + word : word;
      if (measureSvgText(candidate) <= maximumUnits) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      line = '';
      let piece = '';
      for (const character of Array.from(word)) {
        const next = piece + character;
        if (piece && measureSvgText(next) > maximumUnits) {
          lines.push(piece);
          piece = character;
        } else {
          piece = next;
        }
      }
      line = piece;
    }
    if (line) lines.push(line);
  }
  if (lines.length <= maximumLines) return lines;
  const visible = lines.slice(0, maximumLines);
  const last = Array.from(visible[maximumLines - 1]);
  while (last.length > 1 && measureSvgText(last.join('') + '…') > maximumUnits) last.pop();
  visible[maximumLines - 1] = last.join('') + '…';
  return visible;
}

async function readRequestJson(request, maximumBytes = 4_096) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maximumBytes) throw new Error('입력 내용이 너무 길어요.');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new Error('요청 내용을 읽지 못했어요.');
  }
}

function isPublicAddress(address) {
  const family = isIP(address);
  if (family === 4) {
    const [first, second, third] = address.split('.').map(Number);
    return !(
      first === 0 || first === 10 || first === 127 || first >= 224
      || (first === 169 && second === 254)
      || (first === 172 && second >= 16 && second <= 31)
      || (first === 192 && second === 168)
      || (first === 100 && second >= 64 && second <= 127)
      || (first === 192 && second === 0 && third === 0)
      || (first === 192 && second === 0 && third === 2)
      || (first === 198 && (second === 18 || second === 19))
      || (first === 198 && second === 51 && third === 100)
      || (first === 203 && second === 0 && third === 113)
    );
  }
  if (family === 6) {
    const first = Number.parseInt(address.split(':')[0] || '0', 16);
    return first >= 0x2000 && first <= 0x3fff;
  }
  return false;
}

async function readPublicPoster(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('테마 포스터 주소를 확인할 수 없어요.');
  }
  if (
    url.protocol !== 'https:'
    || url.username
    || url.password
    || (url.port && url.port !== '443')
    || url.hostname.length > 253
    || !url.hostname.includes('.')
    || isIP(url.hostname)
    || url.hostname === 'localhost'
    || url.hostname.endsWith('.localhost')
    || url.hostname.endsWith('.local')
  ) {
    throw new Error('안전하지 않은 포스터 주소예요.');
  }

  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some(({ address }) => !isPublicAddress(address))) {
    throw new Error('포스터 서버 주소를 확인할 수 없어요.');
  }

  return new Promise((resolve, reject) => {
    const request = https.request(url, {
      method: 'GET',
      headers: { accept: 'image/jpeg, image/png, image/webp' },
      timeout: 9_000,
      lookup: (_hostname, options, callback) => {
        const address = addresses[0];
        if (options?.all) callback(null, [address]);
        else callback(null, address.address, address.family);
      },
    }, (response) => {
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error('테마 포스터를 가져오지 못했어요.'));
        return;
      }
      const mimeType = String(response.headers['content-type'] || '').split(';')[0].toLowerCase();
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) {
        response.resume();
        reject(new Error('지원하지 않는 포스터 이미지예요.'));
        return;
      }
      const contentLength = Number(response.headers['content-length']);
      if (Number.isFinite(contentLength) && contentLength > 5_000_000) {
        response.resume();
        reject(new Error('포스터 이미지 용량이 너무 커요.'));
        return;
      }
      const chunks = [];
      let size = 0;
      response.on('data', (chunk) => {
        size += chunk.length;
        if (size > 5_000_000) {
          request.destroy(new Error('포스터 이미지 용량이 너무 커요.'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => resolve({ buffer: Buffer.concat(chunks), mimeType }));
      response.on('error', reject);
    });
    request.on('timeout', () => request.destroy(new Error('포스터 서버 연결 시간이 초과됐어요.')));
    request.on('error', reject);
    request.end();
  });
}

function createPhotoCardSvg(theme, poster, record) {
  const themeName = cleanCardText(theme.name || '나의 방탈출 기록', 28);
  const name = escapeXml(themeName);
  const posterDimensions = getRasterDimensions(poster.buffer, poster.mimeType);
  const posterWidth = 1080;
  const measuredHeight = Math.round(posterWidth * posterDimensions.height / posterDimensions.width);
  const posterHeight = Number.isFinite(measuredHeight) && measuredHeight > 0 ? measuredHeight : 1_620;
  const posterData = 'data:' + poster.mimeType + ';base64,' + poster.buffer.toString('base64');
  const recordFields = [
    record.playedOn ? ['플레이 날짜', record.playedOn.replaceAll('-', '.')] : null,
    record.remainingTime ? ['남은 시간', record.remainingTime] : null,
    record.hintCount !== '' ? ['힌트 사용', record.hintCount + '개'] : null,
    record.playerName ? ['플레이어', record.playerName] : null,
  ].filter(Boolean);
  const metadataColumns = recordFields.length > 1 ? 2 : 1;
  const metadataRows = Math.ceil(recordFields.length / metadataColumns);
  const metadataRowHeight = 78;
  const hasEscapeResult = Boolean(record.escapeResult);
  const statusTopOffset = 34;
  const statusHeight = 34;
  const metadataTopOffset = record.showThemeName
    ? hasEscapeResult ? 150 : 106
    : hasEscapeResult ? 92 : 72;
  const metadataHeight = metadataRows * metadataRowHeight;
  const reviewText = record.review.trim();
  const reviewLines = wrapSvgText(reviewText, 40, 12);
  const reviewTopOffset = metadataTopOffset + metadataHeight + (metadataRows ? 22 : 18);
  const bodyBottom = Math.max(reviewLines.length
    ? reviewTopOffset + 25 + reviewLines.length * 32
    : metadataRows ? metadataTopOffset + metadataHeight : metadataTopOffset,
  hasEscapeResult ? statusTopOffset + statusHeight : 0);
  const overlayHeight = Math.max(154, bodyBottom + 43);
  const overlayY = Math.max(0, posterHeight - overlayHeight);
  const metadataMarkup = recordFields.map(([label, value], index) => {
    const row = Math.floor(index / metadataColumns);
    const lastSpansRow = recordFields.length === 3 && index === 2;
    const column = lastSpansRow ? 0 : index % metadataColumns;
    const cellWidth = lastSpansRow || recordFields.length === 1 ? 936 : 468;
    const cellX = lastSpansRow || recordFields.length === 1 ? 72 : 72 + column * 468;
    const center = lastSpansRow || recordFields.length === 1;
    const anchor = center ? 'middle' : 'start';
    const textX = center ? cellX + cellWidth / 2 : cellX + 34;
    const availableWidth = center ? 880 : 405;
    const valueSize = Math.max(17, Math.min(center ? 34 : 28, Math.floor(availableWidth / Math.max(measureSvgText(value), 1))));
    const labelY = overlayY + metadataTopOffset + row * metadataRowHeight + 20;
    return `<g>
      <text x="${textX}" y="${labelY}" text-anchor="${anchor}" fill="#ffffff" fill-opacity=".66" font-family="Arial, sans-serif" font-size="14" font-weight="650" letter-spacing=".4">${escapeXml(label)}</text>
      <text x="${textX}" y="${labelY + 34}" text-anchor="${anchor}" fill="#ffffff" font-family="Arial, sans-serif" font-size="${valueSize}" font-weight="740">${escapeXml(value)}</text>
    </g>`;
  }).join('');
  const metadataRules = (metadataRows > 1
    ? `<path d="M72 ${overlayY + metadataTopOffset + metadataRowHeight}h936" stroke="#ffffff" stroke-opacity=".26" />`
    : '')
    + (metadataColumns === 2
      ? `<path d="M540 ${overlayY + metadataTopOffset}v${recordFields.length === 3 ? metadataRowHeight : metadataHeight}" stroke="#ffffff" stroke-opacity=".22" />`
      : '');
  const reviewMarkup = reviewLines.map((line, index) => `<text x="124" y="${overlayY + reviewTopOffset + 25 + index * 32}" fill="#ffffff" font-family="Arial, sans-serif" font-size="23" font-weight="520">${escapeXml(line)}</text>`).join('');
  const titleSize = Math.max(24, Math.min(46, Math.floor(780 / Math.max(measureSvgText(themeName), 1))));
  const titleMarkup = record.showThemeName
    ? `<text x="72" y="${overlayY + (hasEscapeResult ? 125 : 75)}" fill="#ffffff" font-family="Arial, sans-serif" font-size="${titleSize}" font-weight="760" letter-spacing="-.6">${name}</text>`
    : '';
  const resultLabel = record.escapeResult === 'success' ? 'CLEAR' : record.escapeResult === 'fail' ? 'FAIL' : '';
  const resultColor = record.escapeResult === 'success' ? '#7ee8bd' : '#ff91a2';
  const resultWidth = record.escapeResult === 'success' ? 150 : 112;
  const statusY = overlayY + statusTopOffset;
  const statusGlyphPath = record.escapeResult === 'success'
    ? `M90 ${statusY + 18}l5 5 10-11`
    : `M92 ${statusY + 15}l12 12m0-12-12 12`;
  const statusMarkup = resultLabel
    ? `<g>
      <rect x="72" y="${statusY}" width="${resultWidth}" height="${statusHeight}" rx="17" fill="${resultColor}" fill-opacity=".14" stroke="${resultColor}" stroke-opacity=".78" />
      <path d="${statusGlyphPath}" fill="none" stroke="${resultColor}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
      <text x="116" y="${statusY + 23}" fill="${resultColor}" font-family="Arial, sans-serif" font-size="14" font-weight="760" letter-spacing="1.2">${resultLabel}</text>
    </g>`
    : '';
  const shadeStops = `<stop stop-color="#17112e" stop-opacity="0"/>
        <stop offset=".14" stop-color="#17112e" stop-opacity=".4"/>
        <stop offset=".42" stop-color="#17112e" stop-opacity=".76"/>
        <stop offset=".72" stop-color="#100c22" stop-opacity=".93"/>
        <stop offset="1" stop-color="#100c22" stop-opacity=".96"/>`;
  const reviewQuote = reviewLines.length
    ? `<text x="72" y="${overlayY + reviewTopOffset + 40}" fill="#c4b4ff" fill-opacity=".92" font-family="Georgia, serif" font-size="48">“</text>`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="${posterHeight}" viewBox="0 0 1080 ${posterHeight}" role="img" aria-label="${name} 포토카드">
    <defs>
      <clipPath id="posterClip"><rect width="1080" height="${posterHeight}" rx="34"/></clipPath>
      <linearGradient id="roomSearchFrame" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#22c3ce"/><stop offset=".48" stop-color="#7c5cff"/><stop offset="1" stop-color="#e879aa"/></linearGradient>
      <linearGradient id="bottomShade" gradientUnits="userSpaceOnUse" x1="0" y1="${overlayY}" x2="0" y2="${posterHeight}">
        ${shadeStops}
      </linearGradient>
    </defs>
    <g clip-path="url(#posterClip)">
      <image x="0" y="0" width="${posterWidth}" height="${posterHeight}" preserveAspectRatio="none" href="${posterData}" />
      <rect y="${overlayY}" width="1080" height="${posterHeight - overlayY}" fill="url(#bottomShade)" />
    </g>
    <rect x="8" y="8" width="1064" height="${Math.max(1, posterHeight - 16)}" rx="28" fill="none" stroke="url(#roomSearchFrame)" stroke-width="8" />
    <rect x="18" y="18" width="1044" height="${Math.max(1, posterHeight - 36)}" rx="22" fill="none" stroke="#ffffff" stroke-opacity=".28" stroke-width="1.5" />
    <image x="982" y="18" width="80" height="80" preserveAspectRatio="xMidYMid meet" href="${ROOM_SEARCH_LOGO_DATA_URI}" />
    ${statusMarkup}
    ${titleMarkup}
    ${metadataRules}${metadataMarkup}
    ${reviewQuote}${reviewMarkup}
  </svg>`;
}

function sendSvg(response, svg) {
  response.writeHead(200, {
    'content-type': 'image/svg+xml; charset=utf-8',
    'cache-control': 'no-store, no-cache, must-revalidate, private',
    pragma: 'no-cache',
    expires: '0',
    'content-length': Buffer.byteLength(svg),
    'x-content-type-options': 'nosniff',
  });
  response.end(svg);
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
    if (incoming.pathname === '/api/photocards') {
      if (request.method !== 'POST') {
        return sendJson(response, 405, { message: '포토카드 생성은 POST 요청만 지원해요.' }, { allow: 'POST' });
      }
      if (!/^application\/json(?:\s*;|$)/iu.test(request.headers?.['content-type'] || '')) {
        return sendJson(response, 415, { message: '포토카드 입력 형식이 올바르지 않아요.' });
      }
      if (!apiKey) {
        return sendJson(response, 503, {
          message: '포토카드를 만들 API 키가 설정되지 않았어요. 운영 환경의 ROOM_SEARCH_API_KEY를 확인해 주세요.',
          code: 'API_KEY_MISSING',
        });
      }

      let record;
      try {
        record = readPhotoCardBody(await readRequestJson(request));
      } catch (error) {
        return sendJson(response, 400, { message: error.message || '포토카드 입력을 확인해 주세요.' });
      }

      const requestTime = now();
      const address = requestKey(request);
      const recent = rateLimits.get(address) ?? [];
      const activeRequests = recent.filter((time) => requestTime - time < 60_000);
      if (activeRequests.length >= MAX_REQUESTS_PER_MINUTE) {
        rateLimits.set(address, activeRequests);
        return sendJson(response, 429, { message: '요청이 잠시 많아요. 조금만 기다렸다 다시 시도해 주세요.' }, {
          'retry-after': '60',
        });
      }
      activeRequests.push(requestTime);
      rateLimits.set(address, activeRequests);

      const themeUrl = new URL('/api/escape/themes/' + record.themeId, API_ORIGIN);
      try {
        let theme = cache.get(themeUrl.href);
        if (!theme || theme.expiresAt <= requestTime) {
          const upstream = await fetchImpl(themeUrl, {
            method: 'GET',
            headers: { accept: 'application/json', 'X-API-Key': apiKey },
            signal: AbortSignal.timeout(9_000),
          });
          if (!upstream.ok) {
            const status = upstream.status === 429 ? 429 : 502;
            return sendJson(response, status, {
              message: upstream.status === 429
                ? '검색 요청 한도에 도달했어요. 잠시 후 다시 시도해 주세요.'
                : '테마 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.',
            }, upstream.status === 429 ? { 'retry-after': '60' } : {});
          }
          const envelope = await upstream.json();
          theme = envelope && typeof envelope === 'object' && 'payload' in envelope
            ? envelope.payload
            : envelope;
          if (!validPayload(theme, 'theme')) {
            return sendJson(response, 502, { message: '테마 서버가 예상하지 못한 응답을 보냈어요.' });
          }
          cache.set(themeUrl.href, { body: theme, expiresAt: requestTime + DETAIL_CACHE_MS });
        } else {
          theme = theme.body;
        }

        const posterUrl = theme.photoUrl || theme.posterUrl;
        if (typeof posterUrl !== 'string' || !posterUrl.trim()) {
          return sendJson(response, 422, { message: '등록된 포스터가 없어 포토카드를 만들 수 없어요.' });
        }
        const posterAddress = new URL(posterUrl, API_ORIGIN);
        if (posterAddress.protocol === 'http:') posterAddress.protocol = 'https:';
        const poster = await readPublicPoster(posterAddress.href);
        const svg = createPhotoCardSvg(theme, poster, record);
        // The generated card is returned without writing a file or adding it to the API cache.
        return sendSvg(response, svg);
      } catch (error) {
        return sendJson(response, 502, {
          message: error.message || '포토카드를 만들지 못했어요. 잠시 후 다시 시도해 주세요.',
        });
      }
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
