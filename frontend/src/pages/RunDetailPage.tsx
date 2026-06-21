import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router'
import { apiClient } from '../lib/apiClient'
import type { RunDetail } from '../lib/types'

export function RunDetailPage() {
  const { id = '' } = useParams()
  const { data, isPending, isError } = useQuery({
    queryKey: ['run', id],
    queryFn: () => apiClient.get<RunDetail>(`/api/runs/${id}`),
  })

  return (
    <main>
      <p>
        <Link to="/">Back to prompts</Link>
      </p>
      <h1>Run detail</h1>
      {isPending && <p>Loading…</p>}
      {isError && <p>Could not load this run.</p>}
      {data && (
        <>
          <dl>
            <dt>Version</dt>
            <dd>v{data.versionNumber}</dd>
            <dt>Status</dt>
            <dd>{data.status}</dd>
            <dt>Model</dt>
            <dd>{data.model}</dd>
            {data.inputTokens != null && (
              <>
                <dt>Input tokens</dt>
                <dd>{data.inputTokens}</dd>
              </>
            )}
            {data.outputTokens != null && (
              <>
                <dt>Output tokens</dt>
                <dd>{data.outputTokens}</dd>
              </>
            )}
          </dl>

          <section>
            <h2>Variable values</h2>
            {Object.keys(data.variableValues).length === 0 ? (
              <p>None</p>
            ) : (
              <ul>
                {Object.entries(data.variableValues).map(([name, value]) => (
                  <li key={name}>
                    {name}: {value}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2>Rendered prompt</h2>
            <pre>{data.renderedPrompt}</pre>
          </section>

          {data.response != null && (
            <section>
              <h2>Response</h2>
              <pre aria-label="response">{data.response}</pre>
            </section>
          )}
          {data.status === 'failed' && data.errorMessage && (
            <p role="alert">{data.errorMessage}</p>
          )}
        </>
      )}
    </main>
  )
}
