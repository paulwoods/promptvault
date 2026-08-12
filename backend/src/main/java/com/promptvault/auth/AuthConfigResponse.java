package com.promptvault.auth;

/**
 * The auth configuration the SPA needs before it can render a login screen.
 * {@code googleClientId} is null when Google sign-in is not configured, and the
 * SPA renders no Google button. Delivered at runtime rather than baked in at
 * build time because the SPA is built inside its Docker image (ADR-0011).
 */
public record AuthConfigResponse(String googleClientId) {}
