package com.promptvault.auth;

/**
 * The Google identity boundary. Takes a Google ID token exactly as the browser
 * received it and returns the identity it proves, or throws
 * {@code InvalidCredentialsException} if it proves nothing. No Nimbus or Spring
 * Security OAuth2 type crosses this seam.
 */
public interface GoogleTokenVerifier {

    GoogleIdentity verify(String idToken);
}
