package com.promptvault.activity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import org.hibernate.annotations.CreationTimestamp;

/**
 * One append-only row in a User's Activity feed (ADR-0006): a mutation or
 * login, frozen with a display label so the feed never joins through
 * prompt/version and survives Trash.
 */
@Entity
@Table(name = "activity_event")
public class ActivityEvent {

    public static final String REGISTERED = "registered";
    public static final String LOGGED_IN = "logged_in";
    public static final String API_KEY_SET = "api_key_set";
    public static final String NAME_CHANGED = "name_changed";
    public static final String PROMPT_CREATED = "prompt_created";
    public static final String VERSION_SAVED = "version_saved";
    public static final String PROMPT_DELETED = "prompt_deleted";
    public static final String PROMPT_RESTORED = "prompt_restored";
    public static final String RUN_STARTED = "run_started";

    @Id
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(nullable = false)
    private String type;

    @CreationTimestamp
    @Column(name = "occurred_at", nullable = false)
    private Instant occurredAt;

    @Column(name = "prompt_id")
    private UUID promptId;

    @Column(name = "version_number")
    private Integer versionNumber;

    @Column(name = "run_id")
    private UUID runId;

    @Column(nullable = false)
    private String label;

    protected ActivityEvent() {
        // for JPA
    }

    public ActivityEvent(
            UUID id, UUID userId, String type, UUID promptId, Integer versionNumber, UUID runId, String label) {
        this.id = id;
        this.userId = userId;
        this.type = type;
        this.promptId = promptId;
        this.versionNumber = versionNumber;
        this.runId = runId;
        this.label = label;
    }

    public UUID getId() {
        return id;
    }

    public UUID getUserId() {
        return userId;
    }

    public String getType() {
        return type;
    }

    public Instant getOccurredAt() {
        return occurredAt;
    }

    public UUID getPromptId() {
        return promptId;
    }

    public Integer getVersionNumber() {
        return versionNumber;
    }

    public UUID getRunId() {
        return runId;
    }

    public String getLabel() {
        return label;
    }
}
