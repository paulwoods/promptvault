package com.promptvault.error;

/**
 * Thrown when an owned resource is absent for the current user — including the
 * cross-user case (another user's row is filtered out at the query and so is
 * "not found"). Mapped to 404.
 */
public class ResourceNotFoundException extends RuntimeException {

    public ResourceNotFoundException(String message) {
        super(message);
    }
}
