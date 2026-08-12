# Google sign-in via ID token, linked by verified email

A [User](../CONTEXT.md#user) may sign in with a Google account as well as with a password — both are
[Login Methods](../CONTEXT.md#login-method) on one account, not two accounts. The SPA obtains a Google **ID token**
in-page (no redirect), POSTs it to `/api/auth/google`, and the server verifies it against Google's JWK Set — signature,
issuer, audience, expiry — and then issues the *same* HS256 access token that password login issues. Nothing downstream
of the token knows or cares which Login Method produced it.

A Google account is identified by Google's permanent subject identifier for it, never by its email address. Sign-in
resolves in that order: match the subject identifier and log that User in; otherwise, if Google reports the email as
**verified** and it matches an existing User's email, attach the Google account to that User as a second Login Method;
otherwise provision a new User. A token whose email Google has not verified is rejected outright.

We chose the in-page ID token over a redirect because the app is deliberately stateless — `SessionCreationPolicy.STATELESS`,
no refresh token, no server-side revocation. A redirect flow needs somewhere to keep the `state`/PKCE verifier between
the redirect out and the callback in, which means reintroducing a session (or a cookie repository standing in for one)
for a feature that never needs it: Prompt Vault only wants to learn *who the user is*, once. It never calls a Google API
on the User's behalf, so it has no use for an access token or a refresh token, and storing either would be storing a
credential we would never spend.

We auto-link on a verified email rather than refusing the collision because Google's verification means the person
controls that mailbox — the same bar a password-reset email would clear, and password reset is the recovery path the
alternative designs eventually funnel people into anyway. Refusing is also a dead end at the exact moment someone is
trying to get in. And the option that dodges the question entirely — one account per provider — is not available: `users`
carries a unique index on `lower(email)`, so two accounts sharing an address cannot exist without dropping the index that
makes `findByEmailNormalized` single-valued.

We key on the subject identifier rather than the email because Google's own guidance is explicit that the email can be
changed by the User and is therefore unsuitable as a lookup key. Treating it as identity would mean an email change at
Google either silently orphans the account or forces a write that can collide with another User's address — a
unique-constraint failure on the login path.

## Considered options

- **Redirect-based `oauth2Login` with a server-side session** — the conventional Spring Security flow: browser bounces
  through Google, the callback mints our token and redirects back to the SPA with it. Rejected: it requires relaxing
  `STATELESS`, adds a client secret and a second filter chain, and delivers the token in a URL fragment — a
  history/referrer surface we do not otherwise have.
- **SPA authorization code + PKCE, exchanged by the backend** — the SPA gets a code, the backend trades it with Google
  for tokens. Rejected: it buys the ability to call Google APIs on the User's behalf and to hold a refresh token, neither
  of which this app has any use for; the extra exchange, the client secret, and the stored tokens are pure cost.
- **ID token verified server-side, one account per provider** — a Google sign-in always yields its own User, never
  touching an existing one. Rejected: incompatible with `ux_users_lower_email`, and it splits one person's Prompts across
  two accounts they cannot merge.
- **ID token verified server-side, collision refused and linked later from Profile** — sign-in fails with "log in with
  your password and connect Google from your profile." Rejected: it turns the most common upgrade path into a dead end,
  and it makes a connect/disconnect management surface a prerequisite of shipping Google sign-in at all.
- **ID token verified server-side, auto-linked on verified email (chosen)** — one round trip, no session, no new
  management UI, and the collision case resolves into the outcome the User wanted.

## Consequences

- **A User may now have no password.** `password_hash` becomes nullable, and a check constraint
  (`password_hash is not null or google_sub is not null`) keeps "every User holds at least one Login Method" a database
  invariant rather than a service-layer convention.
- **Trust in account ownership is delegated to Google's email verification.** Anyone able to obtain a Google account
  whose verified email equals an existing User's email can sign in as that User. For consumer addresses that means
  controlling the mailbox. For an address on a Google Workspace domain it also means the domain's administrator, who can
  create verified addresses on that domain at will — so a User whose Prompt Vault email sits on a domain someone else
  administers is exposed to that administrator. This is the accepted cost of auto-linking.
- **`users.email` is written once, at provisioning, and never updated.** A returning Google User whose address changed at
  Google is still correctly identified by subject, but their stored email goes stale until they change it themselves.
  Accepted deliberately: the alternative is a write on the login path that can violate the unique index and lock a
  legitimate User out over an unrelated third party's address.
- **A Google-only User who submits the password form gets the ordinary "Invalid email or password".** The API does not
  disclose which Login Methods an account holds; the recovery path is the Google button sitting on the same form, not the
  error message.
- **There is no unlink, and no way to add a password to a Google-only account.** Removing a Login Method would have to
  respect the check constraint, which means shipping a set-a-password flow (and arguably an email-confirmation step) that
  does not exist anywhere in the app. Connecting happens implicitly by signing in; disconnecting is simply not offered.
- **`GOOGLE_CLIENT_ID` is optional, and its absence disables the feature** rather than stopping the app. This departs
  from `JwtService`, which refuses to start without `PROMPTVAULT_JWT_SECRET`, because that secret has a documented
  dev-only default and a Google client ID cannot: fail-fast would make a real Google Cloud OAuth client a prerequisite of
  running the app at all. The SPA reads the client ID from `/api/auth/config` at runtime and renders no button when it is
  null, so a misconfigured deployment loses the button silently — the compensating signal is a `503 google_not_configured`
  from the endpoint and a warning in the log.
- **The real verifier carries its own tests, unlike `RealClaudeClient`.** The vendor-adapter-goes-untested precedent
  holds where a broken adapter breaks a feature; here a verifier that fails open — audience unchecked, issuer unchecked,
  expiry unenforced — is an authentication bypass that no other test would catch, because every other test drives the
  fake. The tests assert the rejections against a self-signed JWK Set, with no network.
- **The SPA loads its first external script.** `https://accounts.google.com/gsi/client` is injected at runtime, only when
  a client ID is configured. The rendered button is styled by Google and accepts only theme/size/shape/width, so it will
  not match `docs/design/design-system.html`; the ID-token flow offers no supported custom-button path.
- **Logout is unchanged and still client-side only.** Discarding the token ends the Prompt Vault session regardless of
  which Login Method opened it, does not sign the User out of Google, and does not revoke the issued token — which stays
  cryptographically valid until it expires, exactly as it does for password login.
