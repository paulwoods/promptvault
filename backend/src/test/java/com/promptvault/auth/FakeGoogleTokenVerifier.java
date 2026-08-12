package com.promptvault.auth;

/**
 * Test double for {@link GoogleTokenVerifier}. Returns a configured
 * {@link GoogleIdentity} or throws a chosen exception, and captures the token it
 * received so tests can assert the request body reached the seam intact — with
 * no Google, no network, and no signing keys.
 */
public class FakeGoogleTokenVerifier implements GoogleTokenVerifier {

    private GoogleIdentity identity = new GoogleIdentity("sub", "user@example.com", true, "User");
    private RuntimeException error;

    private String capturedIdToken;

    public void respondWith(GoogleIdentity identity) {
        this.identity = identity;
        this.error = null;
    }

    public void failWith(RuntimeException error) {
        this.error = error;
    }

    public String capturedIdToken() {
        return capturedIdToken;
    }

    @Override
    public GoogleIdentity verify(String idToken) {
        this.capturedIdToken = idToken;
        if (error != null) {
            throw error;
        }
        return identity;
    }
}
