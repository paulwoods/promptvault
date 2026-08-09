package com.promptvault.prompt;

import java.time.Instant;
import java.util.UUID;

/** A Prompt in a list. */
public record PromptSummary(UUID promptId, String name, String description, Instant createdAt, Instant updatedAt) {}
