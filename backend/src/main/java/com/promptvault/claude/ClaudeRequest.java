package com.promptvault.claude;

/**
 * An SDK-agnostic request to Claude built from a Prompt's Run Settings. The
 * implementation decides which fields to forward per model (e.g. effort is
 * omitted for models that do not support it).
 */
public record ClaudeRequest(
        String model, String systemPrompt, String userMessage, int maxTokens, String effort, String thinking) {}
