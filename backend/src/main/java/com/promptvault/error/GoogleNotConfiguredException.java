package com.promptvault.error;

/**
 * Thrown when a Google sign-in is attempted while {@code GOOGLE_CLIENT_ID} is
 * unset. Rendered as the distinct {@code google_not_configured} error: the
 * request is not a failed authentication, the feature is simply off (ADR-0011).
 */
public class GoogleNotConfiguredException extends RuntimeException {

    public GoogleNotConfiguredException(String message) {
        super(message);
    }
}
