const wonFormatter = new Intl.NumberFormat('ko-KR');

export function formatWon(value) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? wonFormatter.format(amount) + '원' : '가격 정보 없음';
}

export function formatDuration(value) {
  const minutes = Number(value);
  return Number.isFinite(minutes) && minutes > 0 ? minutes + '분' : '시간 정보 없음';
}

export function formatScore(value) {
  const score = Number(value);
  return Number.isFinite(score) ? score.toFixed(1) : '—';
}

export function formatDate(value) {
  if (!value) return '등록일 정보 없음';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '등록일 정보 없음';
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

export function safeImageUrl(value) {
  if (typeof value !== 'string' || value.length > 2_000) return '';
  try {
    const parsed = new URL(value, 'https://room-search.invalid');
    if (parsed.origin === 'https://room-search.invalid') {
      return parsed.pathname + parsed.search;
    }
    if (parsed.protocol === 'http:') parsed.protocol = 'https:';
    return parsed.protocol === 'https:' ? parsed.href : '';
  } catch {
    return '';
  }
}

export function safeExternalUrl(value) {
  if (typeof value !== 'string' || value.length > 2_000) return '';
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : '';
  } catch {
    return '';
  }
}

export function safePhoneNumber(value) {
  if (typeof value !== 'string') return '';
  const phone = value.replace(/[^\d+()-]/gu, '');
  return /^[\d+()-]{7,24}$/u.test(phone) ? phone : '';
}
