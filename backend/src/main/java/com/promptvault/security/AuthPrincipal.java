package com.promptvault.security;

import java.util.UUID;

/** The authenticated principal resolved from a JWT's claims on each request. */
public record AuthPrincipal(UUID userId, String email) {}
