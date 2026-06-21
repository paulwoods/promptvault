package com.promptvault.prompt;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.UUID;

/** Stable identity for a maintained prompt; all content lives on its Versions. */
@Entity
@Table(name = "prompt")
public class Prompt {

    @Id
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

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
}
