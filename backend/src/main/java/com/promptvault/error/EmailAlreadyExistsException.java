package com.promptvault.error;

/** Thrown when registering an email that already exists (case-insensitively). */
public class EmailAlreadyExistsException extends RuntimeException {

    public EmailAlreadyExistsException(String message) {
        super(message);
    }
}
