const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** GET with retries/backoff. Returns text, or null on failure (never throws). */
export async function get(url, { json = false, retries = 2, headers = {}, timeoutMs = 25000 } = {}) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'user-agent': UA, accept: json ? 'application/json' : '*/*', ...headers },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.status === 429 || res.status >= 500) {
        await sleep(3000 * (attempt + 1));
        continue;
      }
      if (!res.ok) return null;
      const text = await res.text();
      return json ? JSON.parse(text) : text;
    } catch {
      await sleep(1500 * (attempt + 1));
    }
  }
  return null;
}
