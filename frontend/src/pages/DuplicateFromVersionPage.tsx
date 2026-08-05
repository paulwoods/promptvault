import { useMutation, useQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router'
import { LoadError } from '../components/LoadError'
import { Loading } from '../components/Loading'
import { PromptTabs } from '../components/PromptTabs'
import { VersionForm } from '../components/VersionForm'
import {
  toFormValues,
  type VersionRequestBody,
} from '../components/versionFormValues'
import { apiClient } from '../lib/apiClient'
import { usePageTitle } from '../lib/pageTitle'
import type { VersionResponse } from '../lib/types'

export function DuplicateFromVersionPage() {
  const { id = '', number = '' } = useParams()
  const navigate = useNavigate()

  // No number in the URL (/prompts/:id/duplicate) means "duplicate the current
  // version", which the backend serves directly at /versions/current.
  const isCurrentDuplicate = number === ''
  const target = number || 'current'
  const version = useQuery({
    queryKey: ['version', id, target],
    queryFn: () =>
      apiClient.get<VersionResponse>(`/api/prompts/${id}/versions/${target}`),
  })
  usePageTitle(version.data ? `Duplicate: ${version.data.name}` : 'Duplicate')

  const mutation = useMutation({
    mutationFn: (body: VersionRequestBody) =>
      apiClient.post<VersionResponse>('/api/prompts', body),
    onSuccess: (data) => navigate(`/prompts/${data.promptId}/version`),
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
        current={isCurrentDuplicate}
      />
      <VersionForm
        initial={toFormValues(version.data)}
        submitLabel="Duplicate"
        submitClassName="button-inline"
        pending={mutation.isPending}
        error={mutation.error}
        onSubmit={(body) => mutation.mutate(body)}
      />
    </>
  )
}
