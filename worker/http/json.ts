// Every answer the page gets, in one shape. A failure always carries a sentence
// the page can show as it stands: the page never has to invent one, and nothing
// fails silently.

export function json(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { "content-type": "application/json; charset=utf-8", ...(init.headers ?? {}) },
  });
}

export function fail(message: string, status = 400): Response {
  return json({ error: message }, { status });
}

export function noContent(headers: Record<string, string> = {}): Response {
  return new Response(null, { status: 204, headers });
}

/** The body, or null when it is not the JSON it claims to be. Nothing a browser
    sends may make the Worker throw. */
export async function body<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}
