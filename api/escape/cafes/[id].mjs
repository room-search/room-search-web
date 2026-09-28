import { createApiHandler } from '../../_escape-api.mjs';

export default createApiHandler((request) => {
  const id = Array.isArray(request.query?.id) ? request.query.id[0] : request.query?.id;
  return '/api/escape/cafes/' + encodeURIComponent(String(id ?? ''));
});
