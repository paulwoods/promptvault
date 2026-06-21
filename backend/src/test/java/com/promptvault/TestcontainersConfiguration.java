package com.promptvault;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.testcontainers.postgresql.PostgreSQLContainer;

/**
 * Supplies a single Postgres 18 container, wired as the datasource via
 * {@link ServiceConnection}. Imported by {@link IntegrationTest}; Spring's
 * context cache keeps one container shared across the whole suite.
 */
@TestConfiguration(proxyBeanMethods = false)
public class TestcontainersConfiguration {

    @Bean
    @ServiceConnection
    PostgreSQLContainer postgresContainer() {
        return new PostgreSQLContainer("postgres:18.4");
    }
}
