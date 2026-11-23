const scraperAgent = /\b(?:GPTBot|OAI-SearchBot|ChatGPT-User|ClaudeBot|Claude-SearchBot|Claude-User|CCBot|PerplexityBot|Perplexity-User|Bytespider|Amazonbot|meta-externalagent|meta-externalfetch|GoogleOther|Scrapy|HTTrack)\b/i;

function reject(status, message, headers = {}) {
  return new Response(message, {
    status,
    headers: { 'Cache-Control': 'no-store', ...headers },
  });
}

export default {
  async fetch(request, env) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return reject(405, 'Method not allowed.', { Allow: 'GET, HEAD' });
    }
    if (new URL(request.url).pathname === '/robots.txt') return env.ASSETS.fetch(request);
    if (scraperAgent.test(request.headers.get('User-Agent') || '')) {
      return reject(403, 'Automated collection is disabled.');
    }

    const ip = request.headers.get('CF-Connecting-IP');
    if (ip) {
      const { success } = await env.SITE_RATE_LIMIT.limit({ key: ip });
      if (!success) return reject(429, 'Too many requests.', { 'Retry-After': '60' });
    }

    return env.ASSETS.fetch(request);
  },
};
