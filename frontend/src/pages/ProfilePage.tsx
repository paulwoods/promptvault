import { ApiKeyForm } from '../components/ApiKeyForm'
import { LogoutButton } from '../components/LogoutButton'
import { PageHeader } from '../components/PageHeader'
import { getUserEmail } from '../lib/auth'

export function ProfilePage() {
  const email = getUserEmail()

  return (
    <>
      <PageHeader
        title="Profile"
        actions={<LogoutButton className="button-sm button-gold" />}
      />
      <fieldset className="form-section">
        <legend>Profile</legend>
        <dl className="profile-details">
          <dt>Email</dt>
          <dd>{email ?? '—'}</dd>
        </dl>
      </fieldset>
      <fieldset className="form-section">
        <legend>API Key</legend>
        <ApiKeyForm />
      </fieldset>
    </>
  )
}
