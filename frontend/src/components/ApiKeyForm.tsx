import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { apiClient } from '../lib/apiClient'
import { errorMessage } from '../lib/errorMessage'
import type { ApiKeyStatus } from '../lib/types'
import { ErrorAlert } from './ErrorAlert'
import { Loading } from './Loading'

export function ApiKeyForm() {
  const queryClient = useQueryClient()
  const [apiKey, setApiKey] = useState('')
  const [editing, setEditing] = useState(false)

  const status = useQuery({
    queryKey: ['apiKeyStatus'],
    queryFn: () => apiClient.get<ApiKeyStatus>('/api/me/api-key'),
  })

  const masked =
    status.data?.hasKey && status.data.lastSix
      ? `******${status.data.lastSix}`
      : ''
  const showMasked = masked !== '' && !editing && apiKey === ''

  const save = useMutation({
    mutationFn: () => apiClient.put('/api/me/api-key', { apiKey }),
    onSuccess: () => {
      setApiKey('')
      setEditing(false)
      return queryClient.invalidateQueries({ queryKey: ['apiKeyStatus'] })
    },
  })

  return (
    <>
      {status.isPending && <Loading />}

      <form
        onSubmit={(event) => {
          event.preventDefault()
          save.mutate()
        }}
      >
        <label>
          Anthropic API key
          <div className="api-key-row">
            <input
              type={showMasked ? 'text' : 'password'}
              name="apiKey"
              value={showMasked ? masked : apiKey}
              readOnly={showMasked}
              onFocus={() => setEditing(true)}
              onChange={(event) => setApiKey(event.target.value)}
              required
            />
            <button
              type="submit"
              className="button-sm"
              disabled={save.isPending || !editing}
            >
              Save Key
            </button>
          </div>
        </label>
      </form>
      {save.isError && <ErrorAlert>{errorMessage(save.error)}</ErrorAlert>}
    </>
  )
}
