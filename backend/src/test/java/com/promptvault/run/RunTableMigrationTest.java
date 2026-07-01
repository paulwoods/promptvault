package com.promptvault.run;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.promptvault.IntegrationTest;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;

/** Verifies the V4 run migration applied and the status CHECK holds. */
class RunTableMigrationTest extends IntegrationTest {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private record Refs(UUID userId, UUID versionId) {}

    private Refs seedUserPromptVersion() {
        UUID userId = UUID.randomUUID();
        jdbcTemplate.update(
                "insert into users (id, email, password_hash, name) values (?, ?, ?, ?)",
                userId,
                "run-" + userId + "@example.com",
                "hash",
                "Run User");
        UUID promptId = UUID.randomUUID();
        jdbcTemplate.update("insert into prompt (id, user_id) values (?, ?)", promptId, userId);
        UUID versionId = UUID.randomUUID();
        jdbcTemplate.update(
                "insert into version (id, prompt_id, number, name, prompt_text, model, max_tokens, effort, thinking)"
                        + " values (?, ?, 1, 'v1', 'hi', 'claude-opus-4-8', 1000, 'medium', 'off')",
                versionId,
                promptId);
        return new Refs(userId, versionId);
    }

    private void insertRun(Refs refs, String status) {
        jdbcTemplate.update(
                "insert into run (id, user_id, version_id, rendered_prompt, model, status)"
                        + " values (?, ?, ?, ?, ?, ?)",
                UUID.randomUUID(),
                refs.userId(),
                refs.versionId(),
                "rendered",
                "claude-opus-4-8",
                status);
    }

    @Test
    void runTableExists() {
        Boolean exists = jdbcTemplate.queryForObject(
                "select exists (select 1 from information_schema.tables where table_name = 'run')", Boolean.class);
        assertThat(exists).isTrue();
    }

    @Test
    void statusCheckRejectsUnknownStatus() {
        Refs refs = seedUserPromptVersion();
        insertRun(refs, "in_progress");

        assertThatThrownBy(() -> insertRun(refs, "bogus")).isInstanceOf(DataIntegrityViolationException.class);
    }
}
