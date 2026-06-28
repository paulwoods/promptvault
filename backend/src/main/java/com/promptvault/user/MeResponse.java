package com.promptvault.user;

import java.util.UUID;

/** The authenticated user's identity for the profile page and title bar. */
public record MeResponse(UUID id, String email, String name) {}
