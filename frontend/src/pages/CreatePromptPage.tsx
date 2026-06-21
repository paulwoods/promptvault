import { useMutation, useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { VersionForm } from '../components/VersionForm'
import {
  emptyVersionValues,
  type VersionRequestBody,
} from '../components/versionFormValues'
import { apiClient } from '../lib/apiClient'
import type { ModelsResponse, VersionResponse } from '../lib/types'

export function CreatePromptPage() {
  const navigate = useNavigate()
  const models = useQuery({
    queryKey: ['models'],
    queryFn: () => apiClient.get<ModelsResponse>('/api/models'),
  })

  const mutation = useMutation({
    mutationFn: (body: VersionRequestBody) =>
      apiClient.post<VersionResponse>('/api/prompts', body),
    onSuccess: (data) => navigate(`/prompts/${data.promptId}`),
  })

  if (models.isPending) {
    return <p>Loading…</p>
  }
  if (models.isError || !models.data) {
    return <p>Could not load models.</p>
  }

  return (
    <main>
      <h1>New prompt</h1>
      <VersionForm
        initial={emptyVersionValues(models.data.defaultModel)}
        submitLabel="Create prompt"
        pending={mutation.isPending}
        error={mutation.error}
        onSubmit={(body) => mutation.mutate(body)}
      />
    </main>
  )
}
