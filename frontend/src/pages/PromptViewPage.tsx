import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router'
import { LoadError } from '../components/LoadError'
import { Loading } from '../components/Loading'
import { PromptTabs } from '../components/PromptTabs'
import { SimpleList } from '../components/SimpleList'
import { apiClient } from '../lib/apiClient'
import { usePageTitle } from '../lib/pageTitle'
import { isRequired } from '../lib/types'
import type { PromptResponse } from '../lib/types'

export function PromptViewPage() {
  const { id = '' } = useParams()
  const { data, isPending, isError } = useQuery({
    queryKey: ['prompt', id],
    queryFn: () => apiClient.get<PromptResponse>(`/api/prompts/${id}`),
  })
  usePageTitle(data ? data.name : 'Prompt')

  if (isPending) {
    return <Loading />
  }
  if (isError || !data) {
    return <LoadError>Could not load this prompt.</LoadError>
  }

  return (
    <>
      <PromptTabs promptId={id} />
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
                {isRequired(variable) ? ' (required)' : ''}
              </li>
            ))}
          </SimpleList>
        </section>
      )}
    </>
  )
}
