import { errorMessage } from '../lib/errorMessage'
import { useEditableField } from '../lib/useEditableField'
import { useMe } from '../lib/useMe'
import { ErrorAlert } from './ErrorAlert'
import { Loading } from './Loading'

export function NameForm() {
  const me = useMe()
  const {
    value: name,
    setValue: setName,
    editing,
    setEditing,
    save,
  } = useEditableField({
    queryKey: ['me'],
    endpoint: '/api/me/name',
    field: 'name',
  })

  if (me.isPending) return <Loading />

  return (
    <>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          save.mutate()
        }}
      >
        <label>
          Display name
          <div className="api-key-row">
            <input
              type="text"
              name="name"
              value={editing ? name : (me.data?.name ?? '')}
              readOnly={!editing}
              onFocus={() => {
                if (!editing) {
                  setName(me.data?.name ?? '')
                  setEditing(true)
                }
              }}
              onChange={(event) => setName(event.target.value)}
              required
            />
            <button
              type="submit"
              className="button-sm"
              disabled={save.isPending || !editing}
            >
              Save Name
            </button>
          </div>
        </label>
      </form>
      {save.isError && <ErrorAlert>{errorMessage(save.error)}</ErrorAlert>}
    </>
  )
}
