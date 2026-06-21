package com.promptvault;

import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

/**
 * Base for integration tests that exercise the real persistence stack against
 * the shared Testcontainers Postgres (Flyway-migrated). Each test runs in a
 * transaction that is rolled back afterwards for isolation. Tests that cannot
 * use rollback (e.g. concurrency or streaming) should not extend this and must
 * clean up explicitly.
 */
@SpringBootTest
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
@Transactional
public abstract class IntegrationTest {}
