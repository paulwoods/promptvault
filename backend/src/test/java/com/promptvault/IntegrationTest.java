package com.promptvault;

import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.transaction.annotation.Transactional;

/**
 * Base for integration tests that exercise the real persistence stack against
 * the shared Testcontainers Postgres (Flyway-migrated) through the HTTP front
 * door. Each test runs in a transaction that is rolled back afterwards for
 * isolation. Tests that cannot use rollback (e.g. concurrency or streaming)
 * should extend {@link AbstractDatabaseTest} directly and clean up explicitly.
 */
@AutoConfigureMockMvc
@Transactional
public abstract class IntegrationTest extends AbstractDatabaseTest {}
