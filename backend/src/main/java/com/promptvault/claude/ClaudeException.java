package com.promptvault.claude;

/** An SDK-agnostic failure carrying a category and a safe message. */
public class ClaudeException extends RuntimeException {

    private final ErrorCategory category;

    public ClaudeException(ErrorCategory category, String message) {
        super(message);
        this.category = category;
    }

    public ClaudeException(ErrorCategory category, String message, Throwable cause) {
        super(message, cause);
        this.category = category;
    }

    public ErrorCategory getCategory() {
        return category;
    }
}
