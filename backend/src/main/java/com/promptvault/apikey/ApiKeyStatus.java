package com.promptvault.apikey;

import java.time.Instant;

/**
 * API key status: whether a key is stored, when it was last updated, and a hint
 * showing only the last few characters of the key (never the full key).
 */
public record ApiKeyStatus(boolean hasKey, Instant updatedAt, String lastSix) {}
