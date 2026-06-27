package com.promptvault.prompt;

import java.time.Instant;
import java.util.UUID;

/** A Prompt in a list, summarized by its current (latest) Version. */
public record PromptSummary(
        UUID promptId, String name, String description, int currentVersionNumber, Instant createdAt) {}
