package com.promptvault.run;

import static org.assertj.core.api.Assertions.assertThat;

import com.promptvault.IntegrationTest;
import com.promptvault.claude.Usage;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

/** DB-level finalization: a Run is finalized to completed in place with its fields. */
class RunStoreTest extends IntegrationTest {

    @Autowired
    private RunStore runStore;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @PersistenceContext
    private EntityManager entityManager;

    private UUID seedVersionFor(UUID userId) {
        jdbcTemplate.update(
                "insert into users (id, email, password_hash, name) values (?, ?, ?, ?)",
                userId,
                "store-" + userId + "@example.com",
                "hash",
                "Store User");
        UUID promptId = UUID.randomUUID();
        jdbcTemplate.update("insert into prompt (id, user_id) values (?, ?)", promptId, userId);
        UUID versionId = UUID.randomUUID();
        jdbcTemplate.update(
                "insert into version (id, prompt_id, number, name, prompt_text, model, max_tokens, effort, thinking)"
                        + " values (?, ?, 1, 'v1', 'hi', 'claude-opus-4-8', 1000, 'medium', 'off')",
                versionId,
                promptId);
        return versionId;
    }

    @Test
    void finalizeCompletedUpdatesTheSameRowInPlace() {
        UUID userId = UUID.randomUUID();
        UUID versionId = seedVersionFor(userId);
        Run run = runStore.createInProgress(userId, versionId, Map.of(), "rendered", "claude-opus-4-8");

        runStore.finalizeCompleted(run.getId(), "the answer", new Usage(10, 20));
        entityManager.flush();

        assertThat(jdbcTemplate.queryForObject("select status from run where id = ?", String.class, run.getId()))
                .isEqualTo("completed");
        assertThat(jdbcTemplate.queryForObject("select response from run where id = ?", String.class, run.getId()))
                .isEqualTo("the answer");
        assertThat(jdbcTemplate.queryForObject("select input_tokens from run where id = ?", Integer.class, run.getId()))
                .isEqualTo(10);
        assertThat(jdbcTemplate.queryForObject(
                        "select output_tokens from run where id = ?", Integer.class, run.getId()))
                .isEqualTo(20);
    }

    @Test
    void finalizeFailedRecordsCategoryAndMessage() {
        UUID userId = UUID.randomUUID();
        UUID versionId = seedVersionFor(userId);
        Run run = runStore.createInProgress(userId, versionId, Map.of(), "rendered", "claude-opus-4-8");

        runStore.finalizeFailed(run.getId(), "AUTH", "Authentication with Claude failed", "partial");
        entityManager.flush();

        assertThat(jdbcTemplate.queryForObject("select status from run where id = ?", String.class, run.getId()))
                .isEqualTo("failed");
        assertThat(jdbcTemplate.queryForObject(
                        "select error_category from run where id = ?", String.class, run.getId()))
                .isEqualTo("AUTH");
        assertThat(jdbcTemplate.queryForObject("select response from run where id = ?", String.class, run.getId()))
                .isEqualTo("partial");
    }
}
