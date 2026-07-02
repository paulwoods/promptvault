import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { EmptyState } from '../components/EmptyState'
import { ErrorAlert } from '../components/ErrorAlert'
import { LoadError } from '../components/LoadError'
import { Loading } from '../components/Loading'
import { PageHeader } from '../components/PageHeader'
import { apiClient } from '../lib/apiClient'
import { errorMessage } from '../lib/errorMessage'
import type { TrashedPromptSummary } from '../lib/types'

export function TrashPage() {
  const queryClient = useQueryClient()
  const trash = useQuery({
    queryKey: ['trash'],
    queryFn: () => apiClient.get<TrashedPromptSummary[]>('/api/prompts/trash'),
  })

  const restore = useMutation({
    mutationFn: (promptId: string) =>
      apiClient.post(`/api/prompts/${promptId}/restore`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trash'] })
      queryClient.invalidateQueries({ queryKey: ['prompts'] })
    },
  })

  return (
    <>
      <PageHeader title="Trash" />
      {trash.isPending && <Loading />}
      {trash.isError && <LoadError>Could not load trash.</LoadError>}
      {restore.isError && (
        <ErrorAlert>{errorMessage(restore.error)}</ErrorAlert>
      )}
      {trash.data && trash.data.length === 0 && (
        <EmptyState>Trash is empty.</EmptyState>
      )}
      {trash.data && trash.data.length > 0 && (
        <ul>
          {trash.data.map((prompt) => (
            <li key={prompt.promptId}>
              <span>{prompt.name}</span>
              <span>{new Date(prompt.deletedAt).toLocaleString()}</span>
              <button
                type="button"
                className="button-sm"
                disabled={restore.isPending}
                onClick={() => restore.mutate(prompt.promptId)}
              >
                Restore
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
