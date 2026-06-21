package com.promptvault.claude;

/** Token usage reported when a generation completes. */
public record Usage(int inputTokens, int outputTokens) {}
