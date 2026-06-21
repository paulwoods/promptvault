package com.promptvault.error;

/**
 * The API-wide error envelope: a machine-readable {@code error} code, a human
 * {@code message}, and optional {@code details} (e.g. per-field validation
 * messages), {@code null} when there are none. Consolidated in Phase 8.
 */
public record ApiError(String error, String message, Object details) {}
