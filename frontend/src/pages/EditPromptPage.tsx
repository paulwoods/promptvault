import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router'
import { ErrorAlert } from '../components/ErrorAlert'
import { LoadError } from '../components/LoadError'
import { Loading } from '../components/Loading'
import { PromptForm } from '../components/PromptForm'
import {
  toFormValues,
  type PromptRequestBody,
} from '../components/promptFormValues'
import { PromptTabs } from '../components/PromptTabs'
import { apiClient } from '../lib/apiClient'
import { errorMessage } from '../lib/errorMessage'
import { usePageTitle } from '../lib/pageTitle'
import type { PromptResponse } from '../lib/types'

export function EditPromptPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const prompt = useQuery({
    queryKey: ['prompt', id],
    queryFn: () => apiClient.get<PromptResponse>(`/api/prompts/${id}`),
  })
  usePageTitle(prompt.data ? `Edit: ${prompt.data.name}` : 'Edit')

  // Saving overwrites the prompt; the previous content is not recoverable (ADR-0007).
  const mutation = useMutation({
    mutationFn: (body: PromptRequestBody) =>
      apiClient.put<PromptResponse>(`/api/prompts/${id}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prompt', id] })
      queryClient.invalidateQueries({ queryKey: ['prompts'] })
      navigate(`/prompts/${id}`)
    },
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

  if (prompt.isPending) {
    return <Loading />
  }
  if (prompt.isError || !prompt.data) {
    return <LoadError>Could not load this prompt.</LoadError>
  }

  return (
    <>
      <PromptTabs promptId={id} />
      <div className="actions">
        <button
          type="button"
          className="button-sm"
          disabled={deletePrompt.isPending}
          onClick={() => deletePrompt.mutate()}
        >
          Delete
        </button>
      </div>
      {deletePrompt.isError && (
        <ErrorAlert>{errorMessage(deletePrompt.error)}</ErrorAlert>
      )}
      <PromptForm
        initial={toFormValues(prompt.data)}
        submitLabel="Save"
        pending={mutation.isPending}
        error={mutation.error}
        onSubmit={(body) => mutation.mutate(body)}
      />
    </>
  )
}
