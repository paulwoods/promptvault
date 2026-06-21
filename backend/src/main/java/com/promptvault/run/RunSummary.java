package com.promptvault.run;

import java.time.Instant;
import java.util.UUID;

/** A Run in a list: tagged with its Version number, status, timestamp, and a short response preview. */
public record RunSummary(UUID runId, int versionNumber, String status, String responsePreview, Instant createdAt) {}
