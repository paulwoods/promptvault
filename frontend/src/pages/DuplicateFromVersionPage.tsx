import { useMutation, useQuery } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router'
import { LoadError } from '../components/LoadError'
import { Loading } from '../components/Loading'
import { PageHeader } from '../components/PageHeader'
import { PromptTabs } from '../components/PromptTabs'
import { VersionForm } from '../components/VersionForm'
import {
  toFormValues,
  type VersionRequestBody,
} from '../components/versionFormValues'
import { apiClient } from '../lib/apiClient'
import type { VersionResponse } from '../lib/types'

export function DuplicateFromVersionPage() {
  const { id = '', number = '' } = useParams()
  const navigate = useNavigate()

  const version = useQuery({
    queryKey: ['version', id, number],
    queryFn: () =>
      apiClient.get<VersionResponse>(`/api/prompts/${id}/versions/${number}`),
  })

  const mutation = useMutation({
    mutationFn: (body: VersionRequestBody) =>
      apiClient.post<VersionResponse>('/api/prompts', body),
    onSuccess: (data) => navigate(`/prompts/${data.promptId}`),
  })

  if (version.isPending) {
    return <Loading />
  }
  if (version.isError || !version.data) {
    return <LoadError>Could not load this version.</LoadError>
  }

  return (
    <>
      <PromptTabs promptId={id} versionNumber={number} />
      <PageHeader title="Duplicate prompt" />
      <VersionForm
        initial={toFormValues(version.data)}
        submitLabel="Create prompt"
        pending={mutation.isPending}
        error={mutation.error}
        onSubmit={(body) => mutation.mutate(body)}
      />
    </>
  )
}
