package com.promptvault.prompt;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Full frozen content of a Version. */
public record VersionResponse(
        UUID promptId,
        UUID versionId,
        int number,
        String name,
        String description,
        String promptText,
        String model,
        String systemPrompt,
        int maxTokens,
        String effort,
        String thinking,
        List<VariableDeclaration> variables,
        Instant createdAt) {

    public static VersionResponse from(Version version) {
        return new VersionResponse(
                version.getPromptId(),
                version.getId(),
                version.getNumber(),
                version.getName(),
                version.getDescription(),
                version.getPromptText(),
                version.getModel(),
                version.getSystemPrompt(),
                version.getMaxTokens(),
                version.getEffort(),
                version.getThinking(),
                version.getVariables(),
                version.getCreatedAt());
    }
}
