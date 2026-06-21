package com.promptvault.prompt;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;

/**
 * The complete frozen snapshot for a new Version. Mechanical field rules are
 * enforced here; the model set, effort/thinking enums, max_tokens ceiling, and
 * placeholder/Variable rules are enforced in the service (tasks 4.4-4.6).
 */
public record VersionRequest(
        @NotBlank @Size(max = 200) String name,
        @Size(max = 2000) String description,
        @NotBlank @Size(max = 100_000) String promptText,
        @NotBlank String model,
        String systemPrompt,
        @NotNull @Min(1) @Max(64_000) Integer maxTokens,
        @NotBlank String effort,
        @NotBlank String thinking,
        @Valid List<VariableDeclaration> variables) {}
