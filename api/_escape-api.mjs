import { createEscapeApi } from '../server/api.mjs';

const handleApi = createEscapeApi();

export function createApiHandler(pathnameForRequest) {
  return (request, response) => {
    const incoming = new URL(request.url ?? '/', 'http://localhost');
    const pathname = typeof pathnameForRequest === 'function'
      ? pathnameForRequest(request)
      : pathnameForRequest;
    request.url = pathname + incoming.search;
    return handleApi(request, response);
  };
}
