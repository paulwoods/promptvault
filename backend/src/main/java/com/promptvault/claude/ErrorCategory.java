package com.promptvault.claude;

/** Safe, SDK-agnostic categories for a failed generation. */
public enum ErrorCategory {
    AUTH,
    RATE_LIMIT,
    OVERLOADED,
    NETWORK,
    OTHER
}
