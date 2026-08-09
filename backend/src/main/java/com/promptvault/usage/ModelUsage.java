package com.promptvault.usage;

/** A User's all-time token totals for one model. */
public record ModelUsage(String model, long inputTokens, long outputTokens) {}
