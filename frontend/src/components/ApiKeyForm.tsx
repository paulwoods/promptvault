import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../lib/apiClient'
import { errorMessage } from '../lib/errorMessage'
import { useEditableField } from '../lib/useEditableField'
import type { ApiKeyStatus } from '../lib/types'
import { ErrorAlert } from './ErrorAlert'
import { Loading } from './Loading'

export function ApiKeyForm() {
  const {
    value: apiKey,
    setValue: setApiKey,
    editing,
    setEditing,
    save,
  } = useEditableField({
    queryKey: ['apiKeyStatus'],
    endpoint: '/api/me/api-key',
    field: 'apiKey',
  })

  const status = useQuery({
    queryKey: ['apiKeyStatus'],
    queryFn: () => apiClient.get<ApiKeyStatus>('/api/me/api-key'),
  })

  const masked =
    status.data?.hasKey && status.data.lastSix
      ? `******${status.data.lastSix}`
      : ''
  const showMasked = masked !== '' && !editing && apiKey === ''

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
