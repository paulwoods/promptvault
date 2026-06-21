package com.promptvault.run;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/** A persisted one-shot generation of a Version. */
@Entity
@Table(name = "run")
public class Run {

    public static final String IN_PROGRESS = "in_progress";
    public static final String COMPLETED = "completed";
    public static final String FAILED = "failed";

    @Id
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "version_id", nullable = false)
    private UUID versionId;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "variable_values", nullable = false, columnDefinition = "jsonb")
    private Map<String, String> variableValues;

    @Column(name = "rendered_prompt", nullable = false)
    private String renderedPrompt;

    @Column
    private String response;

    @Column(nullable = false)
    private String model;

    @Column(name = "input_tokens")
    private Integer inputTokens;

    @Column(name = "output_tokens")
    private Integer outputTokens;

    @Column(nullable = false)
    private String status;

    @Column(name = "error_category")
    private String errorCategory;

    @Column(name = "error_message")
    private String errorMessage;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected Run() {
        // for JPA
    }

    public Run(
            UUID id,
            UUID userId,
            UUID versionId,
            Map<String, String> variableValues,
            String renderedPrompt,
            String model) {
        this.id = id;
        this.userId = userId;
        this.versionId = versionId;
        this.variableValues = variableValues;
        this.renderedPrompt = renderedPrompt;
        this.model = model;
        this.status = IN_PROGRESS;
    }

    public void markCompleted(String response, int inputTokens, int outputTokens) {
        this.status = COMPLETED;
        this.response = response;
        this.inputTokens = inputTokens;
        this.outputTokens = outputTokens;
    }

    public void markFailed(String errorCategory, String errorMessage, String partialResponse) {
        this.status = FAILED;
        this.errorCategory = errorCategory;
        this.errorMessage = errorMessage;
        this.response = partialResponse;
    }

    public UUID getId() {
        return id;
    }

    public UUID getUserId() {
        return userId;
    }

    public UUID getVersionId() {
        return versionId;
    }

    public Map<String, String> getVariableValues() {
        return variableValues;
    }

    public String getRenderedPrompt() {
        return renderedPrompt;
    }

    public String getResponse() {
        return response;
    }

    public String getModel() {
        return model;
    }

    public Integer getInputTokens() {
        return inputTokens;
    }

    public Integer getOutputTokens() {
        return outputTokens;
    }

    public String getStatus() {
        return status;
    }

    public String getErrorCategory() {
        return errorCategory;
    }

    public String getErrorMessage() {
        return errorMessage;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
