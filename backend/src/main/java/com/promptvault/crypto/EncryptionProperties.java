package com.promptvault.crypto;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Encryption master key configuration. {@code key} is bound from the
 * {@code PROMPTVAULT_ENC_KEY} environment variable (base64-encoded 32 bytes).
 */
@ConfigurationProperties(prefix = "promptvault.enc")
public record EncryptionProperties(String key) {}
