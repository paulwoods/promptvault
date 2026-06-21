package com.promptvault.auth;

import jakarta.validation.constraints.NotBlank;

/** Login credentials. Only non-blank is checked here; bad credentials yield a generic 401. */
public record LoginRequest(@NotBlank String email, @NotBlank String password) {}
