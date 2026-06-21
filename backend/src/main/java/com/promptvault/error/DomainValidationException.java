package com.promptvault.error;

/** A service-layer validation failure for a specific field; mapped to 400 validation_error. */
public class DomainValidationException extends RuntimeException {

    private final String field;

    public DomainValidationException(String field, String message) {
        super(message);
        this.field = field;
    }

    public String getField() {
        return field;
    }
}
