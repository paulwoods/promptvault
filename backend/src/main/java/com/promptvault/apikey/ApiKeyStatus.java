package com.promptvault.apikey;

import java.time.Instant;

/** API key status: whether a key is stored and, if so, when it was last updated. Never the key. */
public record ApiKeyStatus(boolean hasKey, Instant updatedAt) {}
