package com.promptvault.prompt;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Full content of a Prompt. */
public record PromptResponse(
        UUID promptId,
        String name,
        String description,
        String promptText,
        String model,
        String systemPrompt,
        int maxTokens,
        String effort,
        String thinking,
        List<VariableDeclaration> variables,
        Instant createdAt,
        Instant updatedAt) {

    public static PromptResponse from(Prompt prompt) {
        return new PromptResponse(
                prompt.getId(),
                prompt.getName(),
                prompt.getDescription(),
                prompt.getPromptText(),
                prompt.getModel(),
                prompt.getSystemPrompt(),
                prompt.getMaxTokens(),
                prompt.getEffort(),
                prompt.getThinking(),
                prompt.getVariables(),
                prompt.getCreatedAt(),
                prompt.getUpdatedAt());
    }
}
