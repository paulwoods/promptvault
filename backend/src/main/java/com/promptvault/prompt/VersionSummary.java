package com.promptvault.prompt;

import java.time.Instant;
import java.util.UUID;

/** A Version in a Prompt's history (name/number/timestamp + whether it is current). */
public record VersionSummary(UUID versionId, int number, String name, Instant createdAt, boolean current) {}
