package com.promptvault;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

/** Smoke test proving the Testcontainers Postgres is reachable and Flyway-migrated. */
class PersistenceHarnessTest extends IntegrationTest {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void containerIsReachable() {
        assertThat(jdbcTemplate.queryForObject("select 1", Integer.class)).isEqualTo(1);
    }

    @Test
    void flywaySchemaHistoryExists() {
        Boolean exists = jdbcTemplate.queryForObject(
                "select exists (select 1 from information_schema.tables"
                        + " where table_name = 'flyway_schema_history')",
                Boolean.class);
        assertThat(exists).isTrue();
    }
}
