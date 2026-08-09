package com.promptvault.prompt;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/**
 * Something a User maintains and runs. Carries all of its own content and is
 * mutable (ADR-0007): {@link #update} overwrites in place and the previous
 * content is not recoverable.
 */
@Entity
@Table(name = "prompt")
public class Prompt {

    @Id
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(nullable = false)
    private String name;

    @Column
    private String description;

    @Column(name = "prompt_text", nullable = false)
    private String promptText;

    @Column(nullable = false)
    private String model;

    @Column(name = "system_prompt")
    private String systemPrompt;

    @Column(name = "max_tokens", nullable = false)
    private int maxTokens;

    @Column(nullable = false)
    private String effort;

    @Column(nullable = false)
    private String thinking;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false, columnDefinition = "jsonb")
    private List<VariableDeclaration> variables;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    /**
     * When the content last changed. Set explicitly by {@link #update} rather
     * than with {@code @UpdateTimestamp}, which would also fire on delete and
     * restore and float a restored Prompt to the top of the list.
     */
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Column(name = "deleted_at")
    private Instant deletedAt;

    protected Prompt() {
        // for JPA
    }

    public Prompt(
            UUID id,
            UUID userId,
            String name,
            String description,
            String promptText,
            String model,
            String systemPrompt,
            int maxTokens,
            String effort,
            String thinking,
            List<VariableDeclaration> variables) {
        this.id = id;
        this.userId = userId;
        update(name, description, promptText, model, systemPrompt, maxTokens, effort, thinking, variables);
    }

    /** Overwrites every content field. The previous content is gone (ADR-0007). */
    public void update(
            String name,
            String description,
            String promptText,
            String model,
            String systemPrompt,
            int maxTokens,
            String effort,
            String thinking,
            List<VariableDeclaration> variables) {
        this.name = name;
        this.description = description;
        this.promptText = promptText;
        this.model = model;
        this.systemPrompt = systemPrompt;
        this.maxTokens = maxTokens;
        this.effort = effort;
        this.thinking = thinking;
        this.variables = variables;
        this.updatedAt = Instant.now();
    }

    public UUID getId() {
        return id;
    }

    public UUID getUserId() {
        return userId;
    }

    public String getName() {
        return name;
    }

    public String getDescription() {
        return description;
    }

    public String getPromptText() {
        return promptText;
    }

    public String getModel() {
        return model;
    }

    public String getSystemPrompt() {
        return systemPrompt;
    }

    public int getMaxTokens() {
        return maxTokens;
    }

    public String getEffort() {
        return effort;
    }

    public String getThinking() {
        return thinking;
    }

    public List<VariableDeclaration> getVariables() {
        return variables;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
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
