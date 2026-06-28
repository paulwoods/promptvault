package com.promptvault.user;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Request body for changing the display name. Blank/whitespace is rejected. */
public record SetNameRequest(@NotBlank @Size(max = 100) String name) {}
