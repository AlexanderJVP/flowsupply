interface Env {
  ASSETS: Fetcher
  API_WORKER_URL: string
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname.startsWith('/api/')) {
      const target = new URL(url.pathname + url.search, env.API_WORKER_URL)
      return fetch(target.toString(), {
        method: request.method,
        headers: request.headers,
        body: request.body,
      })
    }
    return env.ASSETS.fetch(request)
  },
}
