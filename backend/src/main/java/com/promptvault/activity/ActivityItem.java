package com.promptvault.activity;

import java.time.Instant;
import java.util.UUID;

/**
 * One entry in a User's Activity feed (ADR-0006). {@code versionNumber} is
 * null for event types with no Version context; {@code runStatus} is only
 * populated for {@code run_started} (the Run's live status via PK join).
 */
public record ActivityItem(
        UUID id, String type, Instant occurredAt, String label, Integer versionNumber, String runStatus) {}
