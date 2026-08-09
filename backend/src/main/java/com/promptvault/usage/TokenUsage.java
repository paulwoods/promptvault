package com.promptvault.usage;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import java.util.UUID;

/**
 * A User's running token total for one model (ADR-0005, ADR-0007). One row per
 * model a User has ever run. Runs themselves are not persisted, so this is the
 * only record that tokens were spent.
 *
 * <p>Read-only as far as JPA is concerned: increments go through
 * {@link TokenUsageRepository#addUsage} so that insert-or-increment is one
 * atomic statement rather than a read-modify-write two runs could interleave on.
 */
@Entity
@Table(name = "token_usage")
@IdClass(TokenUsageId.class)
public class TokenUsage {

    @Id
    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Id
    @Column(nullable = false)
    private String model;

    @Column(name = "input_tokens", nullable = false)
    private long inputTokens;

    @Column(name = "output_tokens", nullable = false)
    private long outputTokens;

    protected TokenUsage() {
        // for JPA
    }

    public UUID getUserId() {
        return userId;
    }

    public String getModel() {
        return model;
    }

    public long getInputTokens() {
        return inputTokens;
    }

    public long getOutputTokens() {
        return outputTokens;
    }
}
