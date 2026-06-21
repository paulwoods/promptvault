package com.promptvault.error;

/**
 * Thrown when a Run is attempted without a saved API key. Checked first (before
 * any Variable validation, decryption, or Run row), and rendered as the distinct
 * {@code no_api_key} error so the SPA can route to the key screen.
 */
public class NoApiKeyException extends RuntimeException {

    public NoApiKeyException(String message) {
        super(message);
    }
}
