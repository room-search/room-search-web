import assert from 'node:assert/strict';
import test from 'node:test';
import { createEscapeApi } from '../server/api.mjs';

function mockResponse() {
  return {
    headers: null,
    status: null,
    body: null,
    writeHead(status, headers) {
      this.status = status;
      this.headers = headers;
    },
    end(body) {
      this.body = body;
    },
  };
}

function mockRequest(url, remoteAddress = '127.0.0.1') {
  return { url, method: 'GET', socket: { remoteAddress } };
}

test('theme search forwards only validated parameters and keeps repeated regions', async () => {
  let requestedUrl;
  let requestedHeaders;
  const handle = createEscapeApi({
    apiKey: 'server-only-key',
    fetchImpl: async (url, options) => {
      requestedUrl = new URL(url);
      requestedHeaders = options.headers;
      return new Response(JSON.stringify({ payload: { content: [], totalElements: 0, totalPages: 0 } }));
    },
  });
  const response = mockResponse();
  await handle(
    mockRequest('/api/escape/themes?search=%20%EC%95%84%EC%9D%B4%EB%B8%8C%20&areas=%EC%84%9C%EC%9A%B8&areas=%EB%B6%80%EC%82%B0&endDifficulty=3.5&endFear=2&endPrice=25000&endPlaytime=90&page=1&size=12&sort=price%2Casc&unexpected=ignored'),
    response,
  );

  assert.equal(response.status, 200);
  assert.equal(requestedUrl.origin, 'https://apisis.dev');
  assert.equal(requestedUrl.pathname, '/api/escape/themes');
  assert.equal(requestedUrl.searchParams.get('search'), '아이브');
  assert.deepEqual(requestedUrl.searchParams.getAll('areas'), ['서울', '부산']);
  assert.equal(requestedUrl.searchParams.get('endDifficulty'), '3.5');
  assert.equal(requestedUrl.searchParams.get('endFear'), '2');
  assert.equal(requestedUrl.searchParams.get('endPrice'), '25000');
  assert.equal(requestedUrl.searchParams.get('endPlaytime'), '90');
  assert.equal(requestedUrl.searchParams.get('page'), '1');
  assert.equal(requestedUrl.searchParams.get('size'), '12');
  assert.equal(requestedUrl.searchParams.get('sort'), 'price,asc');
  assert.equal(requestedUrl.searchParams.has('unexpected'), false);
  assert.equal(requestedHeaders['X-API-Key'], 'server-only-key');
  assert.equal(response.body.includes('server-only-key'), false);
});

test('missing API key returns a safe configuration error without calling upstream', async () => {
  let called = false;
  const handle = createEscapeApi({ apiKey: '', fetchImpl: async () => { called = true; } });
  const response = mockResponse();
  await handle(mockRequest('/api/escape/themes'), response);

  assert.equal(response.status, 503);
  assert.equal(JSON.parse(response.body).code, 'API_KEY_MISSING');
  assert.equal(called, false);
});

test('invalid sorting is rejected before an upstream request', async () => {
  let called = false;
  const handle = createEscapeApi({ apiKey: 'server-only-key', fetchImpl: async () => { called = true; } });
  const response = mockResponse();
  await handle(mockRequest('/api/escape/themes?sort=secret%2Cdesc'), response);

  assert.equal(response.status, 400);
  assert.equal(called, false);
});

test('theme detail ignores query parameters and returns a validated payload', async () => {
  let requestedUrl;
  const handle = createEscapeApi({
    apiKey: 'server-only-key',
    fetchImpl: async (url) => {
      requestedUrl = new URL(url);
      return new Response(JSON.stringify({ payload: { refId: 42, name: '비밀의 방' } }));
    },
  });
  const response = mockResponse();
  await handle(mockRequest('/api/escape/themes/42?url=https%3A%2F%2Fevil.example'), response);

  assert.equal(response.status, 200);
  assert.equal(requestedUrl.href, 'https://apisis.dev/api/escape/themes/42');
  assert.deepEqual(JSON.parse(response.body), { refId: 42, name: '비밀의 방' });
});
