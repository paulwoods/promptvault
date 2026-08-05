import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router'
import { ErrorAlert } from '../components/ErrorAlert'
import { LoadError } from '../components/LoadError'
import { Loading } from '../components/Loading'
import { PromptTabs } from '../components/PromptTabs'
import { VersionForm } from '../components/VersionForm'
import {
  toFormValues,
  type VersionRequestBody,
} from '../components/versionFormValues'
import { apiClient } from '../lib/apiClient'
import { errorMessage } from '../lib/errorMessage'
import { usePageTitle } from '../lib/pageTitle'
import type { VersionResponse } from '../lib/types'

export function EditFromVersionPage() {
  const { id = '', number = '' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  // No number in the URL (/prompts/:id/edit) means "edit the current version",
  // which the backend serves directly at /versions/current.
  const isCurrentEdit = number === ''
  const target = number || 'current'
  const version = useQuery({
    queryKey: ['version', id, target],
    queryFn: () =>
      apiClient.get<VersionResponse>(`/api/prompts/${id}/versions/${target}`),
  })
  usePageTitle(version.data ? `Edit: ${version.data.name}` : 'Edit')

  const mutation = useMutation({
    mutationFn: (body: VersionRequestBody) =>
      apiClient.post<VersionResponse>(`/api/prompts/${id}/versions`, body),
    onSuccess: () => navigate(`/prompts/${id}/version`),
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

  if (version.isPending) {
    return <Loading />
  }
  if (version.isError || !version.data) {
    return <LoadError>Could not load this version.</LoadError>
  }

  return (
    <>
      <PromptTabs
        promptId={id}
        versionNumber={version.data.number}
        current={isCurrentEdit}
      />
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
      <VersionForm
        initial={toFormValues(version.data)}
        submitLabel="Save new version"
        pending={mutation.isPending}
        error={mutation.error}
        onSubmit={(body) => mutation.mutate(body)}
      />
    </>
  )
}
