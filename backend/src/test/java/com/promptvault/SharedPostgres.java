package com.promptvault;

import org.testcontainers.postgresql.PostgreSQLContainer;

/**
 * A single Postgres 18 container started once for the whole test suite and
 * shared across every test context (it outlives any one Spring context, so
 * transactional and non-transactional tests reuse the same container).
 */
public final class SharedPostgres {

    public static final PostgreSQLContainer CONTAINER = new PostgreSQLContainer("postgres:18.4");

    static {
        CONTAINER.start();
    }

    private SharedPostgres() {}
}
