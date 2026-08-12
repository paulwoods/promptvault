import { http, HttpResponse } from 'msw'

/** Default happy-path handlers; individual tests override with server.use(...). */
export const handlers = [
  // Google sign-in off by default; tests that want it override this.
  http.get('/api/auth/config', () => HttpResponse.json({})),
  http.get('/api/prompts', () =>
    HttpResponse.json({ items: [], hasMore: false }),
  ),
  http.get('/api/models', () =>
    HttpResponse.json({
      models: [
        {
          id: 'claude-opus-4-8',
          supportsEffort: true,
          supportsAdaptiveThinking: true,
        },
        {
          id: 'claude-haiku-4-5',
          supportsEffort: false,
          supportsAdaptiveThinking: false,
        },
      ],
      defaultModel: 'claude-opus-4-8',
    }),
  ),
]
