package com.promptvault.apikey;

import jakarta.validation.constraints.NotBlank;

/** Request body for setting/replacing the API key. Blank/whitespace is rejected. */
public record SetApiKeyRequest(@NotBlank String apiKey) {}
