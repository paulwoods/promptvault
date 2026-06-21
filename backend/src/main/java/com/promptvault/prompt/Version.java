package com.promptvault.prompt;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import org.hibernate.annotations.CreationTimestamp;

/** An immutable, append-only snapshot of a Prompt's content and Run Settings. */
@Entity
@Table(name = "version")
public class Version {

    @Id
    private UUID id;

    @Column(name = "prompt_id", nullable = false)
    private UUID promptId;

    @Column(nullable = false)
    private int number;

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

    @CreationTimestamp
    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected Version() {
        // for JPA
    }

    public Version(
            UUID id,
            UUID promptId,
            int number,
            String name,
            String description,
            String promptText,
            String model,
            String systemPrompt,
            int maxTokens,
            String effort,
            String thinking) {
        this.id = id;
        this.promptId = promptId;
        this.number = number;
        this.name = name;
        this.description = description;
        this.promptText = promptText;
        this.model = model;
        this.systemPrompt = systemPrompt;
        this.maxTokens = maxTokens;
        this.effort = effort;
        this.thinking = thinking;
    }

    public UUID getId() {
        return id;
    }

    public UUID getPromptId() {
        return promptId;
    }

    public int getNumber() {
        return number;
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

    public Instant getCreatedAt() {
        return createdAt;
    }
}
