package com.promptvault;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.configuration.FluentConfiguration;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.postgresql.ds.PGSimpleDataSource;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Verifies the V9 activity_event migration: table/index/CHECK apply, and the
 * backfill {@code INSERT ... SELECT}s reconstruct true history from
 * pre-existing rows. Runs against a dedicated schema in the shared
 * Testcontainers Postgres (rather than extending {@link IntegrationTest}) so
 * legacy data can be seeded, via migrations 1-8 only, *before* V9 runs —
 * the shared application schema is already migrated past V9 against an
 * empty database at suite startup, so it can't exercise the backfill.
 */
class ActivityEventMigrationTest {

    private static final String SCHEMA = "activity_backfill_test";

    private JdbcTemplate jdbcTemplate;
    private DataSource dataSource;
    private UUID user1;
    private UUID promptB;
    private UUID run1;

    @BeforeEach
    void migrateUpToV8AndSeedLegacyData() throws Exception {
        try (Connection setup = rawConnection()) {
            setup.createStatement().execute("drop schema if exists " + SCHEMA + " cascade");
            setup.createStatement().execute("create schema " + SCHEMA);
        }

        PGSimpleDataSource ds = new PGSimpleDataSource();
        ds.setUrl(SharedPostgres.CONTAINER.getJdbcUrl());
        ds.setUser(SharedPostgres.CONTAINER.getUsername());
        ds.setPassword(SharedPostgres.CONTAINER.getPassword());
        ds.setCurrentSchema(SCHEMA);
        this.dataSource = ds;
        this.jdbcTemplate = new JdbcTemplate(ds);

        flyway().target("8").load().migrate();
        seedLegacyData();
    }

    @AfterEach
    void dropSchema() throws Exception {
        try (Connection cleanup = rawConnection()) {
            cleanup.createStatement().execute("drop schema if exists " + SCHEMA + " cascade");
        }
    }

    private Connection rawConnection() throws Exception {
        return DriverManager.getConnection(
                SharedPostgres.CONTAINER.getJdbcUrl(),
                SharedPostgres.CONTAINER.getUsername(),
                SharedPostgres.CONTAINER.getPassword());
    }

    private FluentConfiguration flyway() {
        return Flyway.configure().dataSource(dataSource).schemas(SCHEMA).locations("classpath:db/migration");
    }

    private void seedLegacyData() {
        user1 = UUID.randomUUID();
        UUID user2 = UUID.randomUUID();
        jdbcTemplate.update(
                "insert into users (id, email, password_hash, name, created_at) values (?, ?, 'hash', 'Alice', ?)",
                user1,
                "alice@example.com",
                Timestamp.from(Instant.now().minus(10, ChronoUnit.DAYS)));
        jdbcTemplate.update(
                "insert into users (id, email, password_hash, name, created_at) values (?, ?, 'hash', 'Bob', ?)",
                user2,
                "bob@example.com",
                Timestamp.from(Instant.now().minus(5, ChronoUnit.DAYS)));

        UUID promptA = UUID.randomUUID();
        jdbcTemplate.update("insert into prompt (id, user_id) values (?, ?)", promptA, user1);
        UUID versionA1 = UUID.randomUUID();
        insertVersion(versionA1, promptA, 1, "Prompt A v1");
        insertVersion(UUID.randomUUID(), promptA, 2, "Prompt A v2");

        promptB = UUID.randomUUID();
        jdbcTemplate.update("insert into prompt (id, user_id, deleted_at) values (?, ?, now())", promptB, user2);
        insertVersion(UUID.randomUUID(), promptB, 1, "Prompt B v1");

        run1 = UUID.randomUUID();
        jdbcTemplate.update(
                "insert into run (id, user_id, version_id, rendered_prompt, model, status)"
                        + " values (?, ?, ?, 'rendered', 'claude-opus-4-8', 'completed')",
                run1,
                user1,
                versionA1);

        jdbcTemplate.update(
                "insert into api_key (id, user_id, iv, ciphertext, auth_tag)"
                        + " values (?, ?, '\\x00'::bytea, '\\x00'::bytea, '\\x00'::bytea)",
                UUID.randomUUID(),
                user1);
    }

    private void insertVersion(UUID id, UUID promptId, int number, String name) {
        jdbcTemplate.update(
                "insert into version (id, prompt_id, number, name, prompt_text, model, max_tokens, effort, thinking)"
                        + " values (?, ?, ?, ?, 'hi', 'claude-opus-4-8', 1000, 'medium', 'off')",
                id,
                promptId,
                number,
                name);
    }

    @Test
    void tableIndexAndCheckApply() {
        flyway().load().migrate();

        Boolean tableExists = jdbcTemplate.queryForObject(
                "select exists (select 1 from information_schema.tables"
                        + " where table_schema = ? and table_name = 'activity_event')",
                Boolean.class,
                SCHEMA);
        assertThat(tableExists).isTrue();

        Boolean indexExists = jdbcTemplate.queryForObject(
                "select exists (select 1 from pg_indexes"
                        + " where schemaname = ? and indexname = 'ix_activity_event_user_occurred')",
                Boolean.class,
                SCHEMA);
        assertThat(indexExists).isTrue();

        assertThatThrownBy(() -> jdbcTemplate.update(
                        "insert into activity_event (id, user_id, type, label) values (?, ?, 'bogus', 'x')",
                        UUID.randomUUID(),
                        user1))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void backfillReconstructsHistoricalEvents() {
        flyway().load().migrate();

        // One registered event per user.
        assertThat(count("type = 'registered'")).isEqualTo(2L);

        // Version 1 of each prompt -> prompt_created (promptA, promptB); version 2 of
        // promptA -> version_saved. Total 3 version rows seeded, split 2/1.
        assertThat(count("type = 'prompt_created'")).isEqualTo(2L);
        assertThat(count("type = 'version_saved'")).isEqualTo(1L);

        // One run_started event, labeled with the Version it ran.
        assertThat(count("type = 'run_started' and run_id = '" + run1 + "'")).isEqualTo(1L);
        assertThat(jdbcTemplate.queryForObject("select label from activity_event where run_id = ?", String.class, run1))
                .isEqualTo("Prompt A v1");

        // Only the currently-Trashed prompt (promptB) gets a prompt_deleted event,
        // labeled with its current Version.
        assertThat(count("type = 'prompt_deleted'")).isEqualTo(1L);
        assertThat(jdbcTemplate.queryForObject(
                        "select label from activity_event where type = 'prompt_deleted' and prompt_id = ?",
                        String.class,
                        promptB))
                .isEqualTo("Prompt B v1");

        // One api_key_set event for the single stored key.
        assertThat(count("type = 'api_key_set'")).isEqualTo(1L);

        // logged_in, name_changed, prompt_restored are never backfilled.
        assertThat(count("type in ('logged_in', 'name_changed', 'prompt_restored')"))
                .isEqualTo(0L);

        // Every backfilled row carries a real label and timestamp.
        assertThat(count("label is null or occurred_at is null")).isEqualTo(0L);
    }

    private long count(String whereClause) {
        return jdbcTemplate.queryForObject("select count(*) from activity_event where " + whereClause, Long.class);
    }
}
