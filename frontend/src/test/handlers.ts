import { http, HttpResponse } from 'msw'

/** Default happy-path handlers; individual tests override with server.use(...). */
export const handlers = [
  http.get('/api/prompts', () =>
    HttpResponse.json({ items: [], hasMore: false }),
  ),
  http.get('/api/prompts/:id/runs', () =>
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
