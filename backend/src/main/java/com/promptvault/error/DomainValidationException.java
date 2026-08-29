package com.promptvault.error;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * A service-layer validation failure; mapped to 400 validation_error. Usually
 * one field — the domain validators are fail-fast by necessity, since a later
 * rule cannot be judged until an earlier one has passed. The mechanical pass
 * over merged content reports every violation at once, so the exception carries
 * a map rather than a single field (ADR-0014).
 */
public class DomainValidationException extends RuntimeException {

    private final Map<String, String> details;

    public DomainValidationException(String field, String message) {
        super(message);
        this.details = Map.of(field, message);
    }

    /** Several violations at once; the message names the fields, the details carry each rule. */
    public DomainValidationException(Map<String, String> details) {
        super("Invalid fields: " + String.join(", ", details.keySet()));
        this.details = new LinkedHashMap<>(details);
    }

    public Map<String, String> getDetails() {
        return Collections.unmodifiableMap(details);
    }
}
