package com.promptvault.usage;

import java.io.Serializable;
import java.util.UUID;

/** Composite key for {@link TokenUsage}: one row per (User, model). */
public record TokenUsageId(UUID userId, String model) implements Serializable {

    public TokenUsageId() {
        this(null, null);
    }
}
