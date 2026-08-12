package com.promptvault.auth;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Google sign-in configuration. {@code clientId} is bound from the
 * {@code GOOGLE_CLIENT_ID} environment variable (relaxed binding) and is
 * optional — when it is unset the feature is off (ADR-0011). {@code jwkSetUri}
 * defaults to Google's published key set and exists only so tests can point the
 * verifier at a local one.
 */
@ConfigurationProperties(prefix = "promptvault.google")
public record GoogleProperties(String clientId, String jwkSetUri) {

    public static final String GOOGLE_JWK_SET_URI = "https://www.googleapis.com/oauth2/v3/certs";

    public GoogleProperties {
        jwkSetUri = jwkSetUri == null ? GOOGLE_JWK_SET_URI : jwkSetUri;
    }
}
