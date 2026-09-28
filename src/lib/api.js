async function request(path, signal) {
  const response = await fetch(path, {
    method: 'GET',
    headers: { accept: 'application/json' },
    signal,
  });
  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error('서버 응답을 읽지 못했어요.');
  }
  if (!response.ok) {
    const error = new Error(body?.message || '검색 서버와 연결하지 못했어요.');
    error.status = response.status;
    error.code = body?.code;
    throw error;
  }
  return body;
}

export function searchThemes(params, signal) {
  return request('/api/escape/themes?' + params.toString(), signal);
}

export async function getLocations(signal) {
  const result = await request('/api/escape/locations', signal);
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.items)) return result.items;
  return [];
}

export function getThemeDetail(refId, signal) {
  return request('/api/escape/themes/' + encodeURIComponent(String(refId)), signal);
}

export function getCafeDetail(cafeId, signal) {
  return request('/api/escape/cafes/' + encodeURIComponent(String(cafeId)), signal);
}
