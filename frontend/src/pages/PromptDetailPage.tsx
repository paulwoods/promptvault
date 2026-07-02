import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router'
import { ErrorAlert } from '../components/ErrorAlert'
import { LoadError } from '../components/LoadError'
import { Loading } from '../components/Loading'
import { PageHeader } from '../components/PageHeader'
import { PromptTabs } from '../components/PromptTabs'
import { apiClient } from '../lib/apiClient'
import { errorMessage } from '../lib/errorMessage'
import type { PromptDetail } from '../lib/types'

export function PromptDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const prompt = useQuery({
    queryKey: ['prompt', id],
    queryFn: () => apiClient.get<PromptDetail>(`/api/prompts/${id}`),
  })

  // Fires immediately on click — no confirmation dialog, matching the app's
  // existing convention (ADR-0004): safe because Trash + restore make it low-stakes.
  const deletePrompt = useMutation({
    mutationFn: () => apiClient.delete(`/api/prompts/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prompts'] })
      navigate('/')
    },
  })

  return (
    <>
      <PromptTabs promptId={id} />
      <PageHeader
        title="Version History"
        actions={
          <button
            type="button"
            className="button-sm"
            disabled={deletePrompt.isPending}
            onClick={() => deletePrompt.mutate()}
          >
            Delete
          </button>
        }
      />
      {deletePrompt.isError && (
        <ErrorAlert>{errorMessage(deletePrompt.error)}</ErrorAlert>
      )}
      {prompt.isPending && <Loading />}
      {prompt.isError && <LoadError>Could not load this prompt.</LoadError>}
      {prompt.data && (
        <ul>
          {prompt.data.versions.map((version) => (
            <li key={version.versionId}>
              <Link to={`/prompts/${id}/versions/${version.number}`}>
                {version.name} (v{version.number})
              </Link>
              <Link
                to={`/prompts/${id}/versions/${version.number}/edit`}
                className="button-link button-link-sm"
              >
                Create New Version
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
