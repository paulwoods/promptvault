package com.promptvault.auth;

import jakarta.validation.constraints.NotBlank;

/** The Google ID token the browser received, forwarded verbatim for verification. */
public record GoogleLoginRequest(@NotBlank String idToken) {}
