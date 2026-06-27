import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router'
import { LoadError } from '../components/LoadError'
import { Loading } from '../components/Loading'
import { PageHeader } from '../components/PageHeader'
import { PromptTabs } from '../components/PromptTabs'
import { apiClient } from '../lib/apiClient'
import type { PromptDetail } from '../lib/types'

export function PromptDetailPage() {
  const { id = '' } = useParams()
  const prompt = useQuery({
    queryKey: ['prompt', id],
    queryFn: () => apiClient.get<PromptDetail>(`/api/prompts/${id}`),
  })

  return (
    <>
      <PromptTabs promptId={id} />
      <PageHeader title="Version history" />
      {prompt.isPending && <Loading />}
      {prompt.isError && <LoadError>Could not load this prompt.</LoadError>}
      {prompt.data && (
        <ul>
          {prompt.data.versions.map((version) => (
            <li key={version.versionId}>
              <Link to={`/prompts/${id}/versions/${version.number}`}>
                {version.name} (v{version.number})
              </Link>
              {version.current && <span> — current</span>}{' '}
              <Link to={`/prompts/${id}/versions/${version.number}/run`}>
                Run
              </Link>{' '}
              <Link to={`/prompts/${id}/versions/${version.number}/edit`}>
                Edit
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
