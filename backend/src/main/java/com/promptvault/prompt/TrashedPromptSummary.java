package com.promptvault.prompt;

import java.time.Instant;
import java.util.UUID;

/** A Prompt currently in Trash: identity, name, and when it was deleted. */
public record TrashedPromptSummary(UUID promptId, String name, Instant deletedAt) {}
