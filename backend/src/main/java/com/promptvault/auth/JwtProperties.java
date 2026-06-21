package com.promptvault.auth;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * JWT signing configuration. {@code secret} is bound from the
 * {@code PROMPTVAULT_JWT_SECRET} environment variable (relaxed binding).
 */
@ConfigurationProperties(prefix = "promptvault.jwt")
public record JwtProperties(String secret) {}
