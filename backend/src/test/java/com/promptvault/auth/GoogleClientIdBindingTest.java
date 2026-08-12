package com.promptvault.auth;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.LinkedHashMap;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.core.env.SystemEnvironmentPropertySource;

/**
 * The documented environment variable is {@code GOOGLE_CLIENT_ID}, but
 * {@link GoogleProperties} binds under the {@code promptvault.google} prefix,
 * which relaxed binding would only match from {@code
 * PROMPTVAULT_GOOGLE_CLIENT_ID}. The two are bridged by a single placeholder in
 * application.properties, and nothing else in the suite exercises it: every
 * other test sets {@code promptvault.google.client-id} directly and so passes
 * whether or not the bridge exists. Losing it silently disables Google sign-in
 * for every deployment - the app still starts and password login still works,
 * so only the missing button gives it away (ADR-0011).
 *
 * <p>These tests read the real application.properties, which is the artifact
 * under test.
 */
class GoogleClientIdBindingTest {

    private static final String CLIENT_ID = "test-client-id.apps.googleusercontent.com";

    @Test
    void bindsTheClientIdFromTheGoogleClientIdEnvironmentVariable() {
        runnerWithEnvironment(Map.of("GOOGLE_CLIENT_ID", CLIENT_ID))
                .run(context ->
                        assertThat(context.getBean(GoogleProperties.class).clientId())
                                .isEqualTo(CLIENT_ID));
    }

    /** No environment variable is the unconfigured deployment: the feature is simply off. */
    @Test
    void leavesTheClientIdEmptyWhenTheEnvironmentVariableIsUnset() {
        runnerWithEnvironment(Map.of()).run(context -> assertThat(
                        context.getBean(GoogleProperties.class).clientId())
                .isNullOrEmpty());
    }

    /**
     * Registers {@code variables} under the name Spring gives the real process
     * environment, which replaces it rather than layering over it - otherwise a
     * developer who exported .env into their shell would fail the unset case.
     */
    private ApplicationContextRunner runnerWithEnvironment(Map<String, String> variables) {
        return new ApplicationContextRunner()
                .withInitializer(new ConfigDataApplicationContextInitializer())
                .withInitializer(context -> context.getEnvironment()
                        .getPropertySources()
                        .addFirst(new SystemEnvironmentPropertySource(
                                StandardEnvironment.SYSTEM_ENVIRONMENT_PROPERTY_SOURCE_NAME,
                                new LinkedHashMap<>(variables))))
                .withUserConfiguration(GooglePropertiesConfiguration.class);
    }

    @Configuration
    @EnableConfigurationProperties(GoogleProperties.class)
    static class GooglePropertiesConfiguration {}
}
