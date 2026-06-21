import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router'
import { apiClient } from '../lib/apiClient'
import type { VersionResponse } from '../lib/types'

export function VersionViewPage() {
  const { id = '', number = '' } = useParams()
  const { data, isPending, isError } = useQuery({
    queryKey: ['version', id, number],
    queryFn: () =>
      apiClient.get<VersionResponse>(`/api/prompts/${id}/versions/${number}`),
  })

  return (
    <main>
      <p>
        <Link to={`/prompts/${id}`}>Back to history</Link>
      </p>
      {isPending && <p>Loading…</p>}
      {isError && <p>Could not load this version.</p>}
      {data && (
        <>
          <h1>
            {data.name} (v{data.number})
          </h1>
          {data.description && <p>{data.description}</p>}
          <dl>
            <dt>Model</dt>
            <dd>{data.model}</dd>
            <dt>Max tokens</dt>
            <dd>{data.maxTokens}</dd>
            <dt>Effort</dt>
            <dd>{data.effort}</dd>
            <dt>Thinking</dt>
            <dd>{data.thinking}</dd>
          </dl>
          {data.systemPrompt && (
            <section>
              <h2>System prompt</h2>
              <p>{data.systemPrompt}</p>
            </section>
          )}
          <section>
            <h2>Prompt text</h2>
            <pre>{data.promptText}</pre>
          </section>
          {data.variables.length > 0 && (
            <section>
              <h2>Variables</h2>
              <ul>
                {data.variables.map((variable) => (
                  <li key={variable.name}>
                    {variable.name}
                    {variable.required ? ' (required)' : ''}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </main>
  )
}
