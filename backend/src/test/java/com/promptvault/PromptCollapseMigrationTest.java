package com.promptvault;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.configuration.FluentConfiguration;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.postgresql.ds.PGSimpleDataSource;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Verifies the V10 collapse (ADR-0007): Version's content lands on prompt, the
 * current (max-number) Version wins, updated_at preserves list ordering, token
 * totals survive as token_usage, and version/run/activity_event are gone.
 *
 * <p>Runs against a dedicated schema in the shared Testcontainers Postgres
 * (rather than extending {@link IntegrationTest}) so legacy data can be seeded,
 * via migrations 1-9 only, *before* V10 runs — the shared application schema is
 * already migrated past V10 against an empty database at suite startup, so it
 * can't exercise the backfill.
 */
class PromptCollapseMigrationTest {

    private static final String SCHEMA = "prompt_collapse_test";

    private JdbcTemplate jdbcTemplate;
    private DataSource dataSource;
    private UUID user1;
    private UUID user2;
    private UUID promptA;
    private UUID promptB;
    private Instant promptAV1CreatedAt;
    private Instant promptAV3CreatedAt;

    @BeforeEach
    void migrateUpToV9AndSeedLegacyData() throws Exception {
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

        flyway().target("9").load().migrate();
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

    private void migrateToV10() {
        flyway().target("10").load().migrate();
    }

    private void seedLegacyData() {
        user1 = UUID.randomUUID();
        user2 = UUID.randomUUID();
        insertUser(user1, "alice@example.com");
        insertUser(user2, "bob@example.com");

        // Prompt A: three Versions. Version 3 is current and must be what lands on prompt.
        promptA = UUID.randomUUID();
        promptAV1CreatedAt = Instant.now().minus(9, ChronoUnit.DAYS);
        jdbcTemplate.update(
                "insert into prompt (id, user_id, created_at) values (?, ?, ?)",
                promptA,
                user1,
                Timestamp.from(promptAV1CreatedAt));
        promptAV3CreatedAt = Instant.now().minus(2, ChronoUnit.DAYS);
        UUID versionA1 = insertVersion(promptA, 1, "A v1", "first", "old text", promptAV1CreatedAt);
        insertVersion(promptA, 2, "A v2", "second", "middle text", Instant.now().minus(5, ChronoUnit.DAYS));
        insertVersion(promptA, 3, "A v3", "third", "current text {{who}}", promptAV3CreatedAt);

        // Prompt B: owned by user2 and in Trash — the collapse must not care.
        promptB = UUID.randomUUID();
        jdbcTemplate.update("insert into prompt (id, user_id, deleted_at) values (?, ?, now())", promptB, user2);
        UUID versionB1 = insertVersion(promptB, 1, "B v1", null, "b text", Instant.now().minus(1, ChronoUnit.DAYS));

        // Runs: two completed on one model, one on another, and one failed (no tokens).
        insertRun(user1, versionA1, "claude-opus-4-8", "completed", 10, 20);
        insertRun(user1, versionA1, "claude-opus-4-8", "completed", 5, 7);
        insertRun(user1, versionA1, "claude-haiku-4-5", "completed", 1, 2);
        insertRun(user1, versionA1, "claude-opus-4-8", "failed", null, null);
        insertRun(user2, versionB1, "claude-opus-4-8", "completed", 100, 200);
    }

    private void insertUser(UUID id, String email) {
        jdbcTemplate.update(
                "insert into users (id, email, password_hash, name, created_at)"
                        + " values (?, ?, 'hash', 'Test', ?)",
                id,
                email,
                Timestamp.from(Instant.now().minus(10, ChronoUnit.DAYS)));
    }

    private UUID insertVersion(UUID promptId, int number, String name, String description, String text, Instant at) {
        UUID id = UUID.randomUUID();
        jdbcTemplate.update(
                "insert into version (id, prompt_id, number, name, description, prompt_text, model,"
                        + " system_prompt, max_tokens, effort, thinking, variables, created_at)"
                        + " values (?, ?, ?, ?, ?, ?, 'claude-opus-4-8', 'sys', 1234, 'high', 'adaptive',"
                        + " '[{\"name\":\"who\",\"required\":true}]'::jsonb, ?)",
                id,
                promptId,
                number,
                name,
                description,
                text,
                Timestamp.from(at));
        return id;
    }

    private void insertRun(UUID userId, UUID versionId, String model, String status, Integer in, Integer out) {
        jdbcTemplate.update(
                "insert into run (id, user_id, version_id, rendered_prompt, model, status, input_tokens,"
                        + " output_tokens) values (?, ?, ?, 'rendered', ?, ?, ?, ?)",
                UUID.randomUUID(),
                userId,
                versionId,
                model,
                status,
                in,
                out);
    }

    @Test
    void promptTakesItsCurrentVersionsContent() {
        migrateToV10();

        Map<String, Object> prompt =
                jdbcTemplate.queryForMap("select * from prompt where id = ?", promptA);
        assertThat(prompt.get("name")).isEqualTo("A v3");
        assertThat(prompt.get("description")).isEqualTo("third");
        assertThat(prompt.get("prompt_text")).isEqualTo("current text {{who}}");
        assertThat(prompt.get("model")).isEqualTo("claude-opus-4-8");
        assertThat(prompt.get("system_prompt")).isEqualTo("sys");
        assertThat(prompt.get("max_tokens")).isEqualTo(1234);
        assertThat(prompt.get("effort")).isEqualTo("high");
        assertThat(prompt.get("thinking")).isEqualTo("adaptive");
        assertThat(prompt.get("variables").toString()).contains("who");
    }

    @Test
    void updatedAtComesFromTheCurrentVersionSoListOrderingIsUnchanged() {
        migrateToV10();

        Instant updatedAt = jdbcTemplate
                .queryForObject("select updated_at from prompt where id = ?", Timestamp.class, promptA)
                .toInstant();
        assertThat(updatedAt).isCloseTo(promptAV3CreatedAt, within(1, ChronoUnit.SECONDS));
        // V3's created_at column is left untouched, so it still marks creation.
        Instant createdAt = jdbcTemplate
                .queryForObject("select created_at from prompt where id = ?", Timestamp.class, promptA)
                .toInstant();
        assertThat(createdAt).isCloseTo(promptAV1CreatedAt, within(1, ChronoUnit.SECONDS));
        assertThat(createdAt).isBefore(updatedAt);
    }

    @Test
    void aTrashedPromptIsCollapsedToo() {
        migrateToV10();

        Map<String, Object> prompt = jdbcTemplate.queryForMap("select * from prompt where id = ?", promptB);
        assertThat(prompt.get("name")).isEqualTo("B v1");
        assertThat(prompt.get("prompt_text")).isEqualTo("b text");
        assertThat(prompt.get("deleted_at")).isNotNull();
    }

    @Test
    void tokenTotalsAreBackfilledPerUserAndModelFromCompletedRunsOnly() {
        migrateToV10();

        List<Map<String, Object>> usage = jdbcTemplate.queryForList(
                "select model, input_tokens, output_tokens from token_usage where user_id = ? order by model",
                user1);
        assertThat(usage).hasSize(2);
        assertThat(usage.get(0)).containsEntry("model", "claude-haiku-4-5");
        assertThat(usage.get(0)).containsEntry("input_tokens", 1L).containsEntry("output_tokens", 2L);
        // 10+5 in, 20+7 out — the failed run contributes nothing.
        assertThat(usage.get(1)).containsEntry("model", "claude-opus-4-8");
        assertThat(usage.get(1)).containsEntry("input_tokens", 15L).containsEntry("output_tokens", 27L);

        Long otherUserInput = jdbcTemplate.queryForObject(
                "select input_tokens from token_usage where user_id = ? and model = 'claude-opus-4-8'",
                Long.class,
                user2);
        assertThat(otherUserInput).isEqualTo(100L);
    }

    @Test
    void versionRunAndActivityTablesAreGone() {
        migrateToV10();

        List<String> tables = jdbcTemplate.queryForList(
                "select table_name from information_schema.tables where table_schema = ?", String.class, SCHEMA);
        assertThat(tables).doesNotContain("version", "run", "activity_event");
        assertThat(tables).contains("prompt", "token_usage", "users", "api_key");
    }
}
