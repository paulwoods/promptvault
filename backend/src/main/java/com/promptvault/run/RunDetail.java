package com.promptvault.run;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

/** Full detail of a single Run (story 39). */
public record RunDetail(
        UUID runId,
        int versionNumber,
        String model,
        Map<String, String> variableValues,
        String renderedPrompt,
        String response,
        Integer inputTokens,
        Integer outputTokens,
        String status,
        String errorCategory,
        String errorMessage,
        Instant createdAt) {}
