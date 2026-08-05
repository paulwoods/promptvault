import { ApiKeyForm } from '../components/ApiKeyForm'
import { usePageTitle } from '../lib/pageTitle'

export function ApiKeyPage() {
  usePageTitle('API Key')
  return <ApiKeyForm />
}
