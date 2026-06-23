import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { ErrorAlert } from '../components/ErrorAlert'
import { Loading } from '../components/Loading'
import { PageHeader } from '../components/PageHeader'
import { apiClient } from '../lib/apiClient'
import { errorMessage } from '../lib/errorMessage'
import type { ApiKeyStatus } from '../lib/types'

export function ApiKeyPage() {
  const queryClient = useQueryClient()
  const [apiKey, setApiKey] = useState('')

  const status = useQuery({
    queryKey: ['apiKeyStatus'],
    queryFn: () => apiClient.get<ApiKeyStatus>('/api/me/api-key'),
  })

  const save = useMutation({
    mutationFn: () => apiClient.put('/api/me/api-key', { apiKey }),
    onSuccess: () => {
      setApiKey('')
      return queryClient.invalidateQueries({ queryKey: ['apiKeyStatus'] })
    },
  })

  return (
    <>
      <PageHeader title="API key" />
      {status.isPending && <Loading />}
      {status.data && (
        <p>{status.data.hasKey ? 'A key is set' : 'No key set'}</p>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault()
          save.mutate()
        }}
      >
        <label>
          Anthropic API key
          <input
            type="password"
            name="apiKey"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            required
          />
        </label>
        <button type="submit" disabled={save.isPending}>
          Save key
        </button>
      </form>
      {save.isError && <ErrorAlert>{errorMessage(save.error)}</ErrorAlert>}
    </>
  )
}
