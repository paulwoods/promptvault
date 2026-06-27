import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router'
import { LoadError } from '../components/LoadError'
import { Loading } from '../components/Loading'
import { PageHeader } from '../components/PageHeader'
import { PromptTabs } from '../components/PromptTabs'
import { SimpleList } from '../components/SimpleList'
import { apiClient } from '../lib/apiClient'
import type { VersionResponse } from '../lib/types'

export function VersionViewPage() {
  const { id = '', number = '' } = useParams()
  const { data, isPending, isError } = useQuery({
    queryKey: ['version', id, number],
    queryFn: () =>
      apiClient.get<VersionResponse>(`/api/prompts/${id}/versions/${number}`),
  })

  if (isPending) {
    return <Loading />
  }
  if (isError || !data) {
    return <LoadError>Could not load this version.</LoadError>
  }

  return (
    <>
      <PromptTabs promptId={id} versionNumber={data.number} />
      <PageHeader title={`${data.name} (v${data.number})`} />
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
          <SimpleList>
            {data.variables.map((variable) => (
              <li key={variable.name}>
                {variable.name}
                {variable.required ? ' (required)' : ''}
              </li>
            ))}
          </SimpleList>
        </section>
      )}
    </>
  )
}
