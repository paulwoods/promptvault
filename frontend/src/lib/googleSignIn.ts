/**
 * Thin wrapper over Google Identity Services. The GIS script is the app's only
 * external script and is injected at runtime, so it loads only for deployments
 * that configured a client id (ADR-0011). Everything the app knows about
 * `window.google` lives here, which is also what makes it stubbable in tests.
 */

const GIS_SRC = 'https://accounts.google.com/gsi/client'

interface CredentialResponse {
  credential: string
}

interface GoogleIdApi {
  initialize(config: {
    client_id: string
    callback: (response: CredentialResponse) => void
  }): void
  renderButton(
    parent: HTMLElement,
    options: {
      theme?: string
      size?: string
      text?: string
      shape?: string
      width?: number
    },
  ): void
}

declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleIdApi } }
  }
}

let loading: Promise<GoogleIdApi> | null = null

/** Resolves the GIS API, injecting its script at most once per page load. */
function loadGoogleIdentity(): Promise<GoogleIdApi> {
  const loaded = window.google?.accounts?.id
  if (loaded) {
    return Promise.resolve(loaded)
  }
  loading ??= new Promise<GoogleIdApi>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = GIS_SRC
    script.async = true
    script.onload = () => {
      const api = window.google?.accounts?.id
      if (api) {
        resolve(api)
      } else {
        reject(new Error('Google sign-in is unavailable'))
      }
    }
    script.onerror = () => {
      // Allow a later attempt to retry the load rather than reusing the failure.
      loading = null
      reject(new Error('Google sign-in is unavailable'))
    }
    document.head.appendChild(script)
  })
  return loading
}

/**
 * Renders Google's own button into `parent` and reports the ID token it yields.
 * The button is styled by Google — theme, size, shape and width are the only
 * things we get to choose.
 */
export async function renderGoogleButton(
  parent: HTMLElement,
  clientId: string,
  onCredential: (idToken: string) => void,
): Promise<void> {
  const api = await loadGoogleIdentity()
  api.initialize({
    client_id: clientId,
    callback: (response) => onCredential(response.credential),
  })
  api.renderButton(parent, {
    theme: 'filled_black',
    size: 'large',
    text: 'continue_with',
    shape: 'rectangular',
    width: 400,
  })
}
