import { ActivityFeed } from '../components/ActivityFeed'
import { ApiKeyForm } from '../components/ApiKeyForm'
import { LogoutButton } from '../components/LogoutButton'
import { NameForm } from '../components/NameForm'
import { PageHeader } from '../components/PageHeader'
import { UsageSummary } from '../components/UsageSummary'
import { useMe } from '../lib/useMe'

export function ProfilePage() {
  const me = useMe()

  return (
    <>
      <PageHeader
        title="Profile"
        actions={<LogoutButton className="button-sm button-gold" />}
      />
      <fieldset className="form-section">
        <legend>Profile</legend>
        <NameForm />
        <dl className="profile-details">
          <dt>Email</dt>
          <dd>{me.data?.email ?? '—'}</dd>
        </dl>
      </fieldset>
      <fieldset className="form-section">
        <legend>API Key</legend>
        <ApiKeyForm />
      </fieldset>
      <fieldset className="form-section">
        <legend>Usage</legend>
        <UsageSummary />
      </fieldset>
      <fieldset className="form-section">
        <legend>Recent activity</legend>
        <ActivityFeed />
      </fieldset>
    </>
  )
}
