package com.promptvault.config;

import com.promptvault.auth.GoogleProperties;
import com.promptvault.auth.GoogleTokenVerifier;
import com.promptvault.auth.RealGoogleTokenVerifier;
import com.promptvault.error.GoogleNotConfiguredException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.util.StringUtils;

/**
 * Chooses the {@link GoogleTokenVerifier} for this deployment. Unlike
 * {@code PROMPTVAULT_JWT_SECRET}, an unset {@code GOOGLE_CLIENT_ID} does not
 * stop the app: it would make a real Google Cloud OAuth client a prerequisite
 * of running Prompt Vault at all. The feature turns off instead, and the log
 * warning here is the compensating signal for a deployment that meant to
 * enable it (ADR-0011).
 */
@Configuration
public class GoogleAuthConfig {

    private static final Logger log = LoggerFactory.getLogger(GoogleAuthConfig.class);

    @Bean
    public GoogleTokenVerifier googleTokenVerifier(GoogleProperties properties) {
        if (!StringUtils.hasText(properties.clientId())) {
            log.warn("GOOGLE_CLIENT_ID is not set - Google sign-in is disabled.");
            return idToken -> {
                throw new GoogleNotConfiguredException("Google sign-in is not configured");
            };
        }
        return new RealGoogleTokenVerifier(properties.clientId(), properties.jwkSetUri());
    }
}
