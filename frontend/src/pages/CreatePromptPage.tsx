import { useMutation, useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { LoadError } from '../components/LoadError'
import { Loading } from '../components/Loading'
import { VersionForm } from '../components/VersionForm'
import {
  emptyVersionValues,
  type VersionRequestBody,
} from '../components/versionFormValues'
import { apiClient } from '../lib/apiClient'
import { usePageTitle } from '../lib/pageTitle'
import type { ModelsResponse, VersionResponse } from '../lib/types'

export function CreatePromptPage() {
  const navigate = useNavigate()
  usePageTitle('New prompt')
  const models = useQuery({
    queryKey: ['models'],
    queryFn: () => apiClient.get<ModelsResponse>('/api/models'),
  })

  const mutation = useMutation({
    mutationFn: (body: VersionRequestBody) =>
      apiClient.post<VersionResponse>('/api/prompts', body),
    onSuccess: (data) => navigate(`/prompts/${data.promptId}/version`),
  })

  if (models.isPending) {
    return <Loading />
  }
  if (models.isError || !models.data) {
    return <LoadError>Could not load models.</LoadError>
  }

  return (
    <VersionForm
      initial={emptyVersionValues(models.data.defaultModel)}
      submitLabel="Create prompt"
      pending={mutation.isPending}
      error={mutation.error}
      onSubmit={(body) => mutation.mutate(body)}
    />
  )
}
