package com.promptvault.prompt;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

/** Stable identity for a maintained prompt; all content lives on its Versions. */
@Entity
@Table(name = "prompt")
public class Prompt {

    @Id
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "deleted_at")
    private Instant deletedAt;

    protected Prompt() {
        // for JPA
    }

    public Prompt(UUID id, UUID userId) {
        this.id = id;
        this.userId = userId;
    }

    public UUID getId() {
        return id;
    }

    public UUID getUserId() {
        return userId;
    }

    public Instant getDeletedAt() {
        return deletedAt;
    }

    /** Moves this Prompt to Trash (ADR-0004). Idempotent: re-deleting just bumps the timestamp. */
    public void markDeleted() {
        this.deletedAt = Instant.now();
    }

    /** Restores this Prompt out of Trash. */
    public void restore() {
        this.deletedAt = null;
    }
}
