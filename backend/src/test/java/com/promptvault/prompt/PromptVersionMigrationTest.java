package com.promptvault.prompt;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.promptvault.IntegrationTest;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;

/** Verifies the V3 prompt/version migration: identity-only prompt, append-only version. */
class PromptVersionMigrationTest extends IntegrationTest {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private UUID insertPromptForNewUser() {
        UUID userId = UUID.randomUUID();
        jdbcTemplate.update(
                "insert into users (id, email, password_hash, name) values (?, ?, ?, ?)",
                userId,
                "owner-" + userId + "@example.com",
                "hash",
                "Owner User");
        UUID promptId = UUID.randomUUID();
        jdbcTemplate.update("insert into prompt (id, user_id) values (?, ?)", promptId, userId);
        return promptId;
    }

    private void insertVersion(UUID promptId, int number, String effort, String thinking) {
        jdbcTemplate.update(
                "insert into version (id, prompt_id, number, name, prompt_text, model, max_tokens, effort, thinking)"
                        + " values (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                UUID.randomUUID(),
                promptId,
                number,
                "v" + number,
                "hello",
                "claude-opus-4-8",
                1000,
                effort,
                thinking);
    }

    @Test
    void promptHasNoMutableContentColumns() {
        List<String> columns = jdbcTemplate.queryForList(
                "select column_name from information_schema.columns where table_name = 'prompt'", String.class);
        // deleted_at (V8) is lifecycle metadata (ADR-0004 soft delete), not content.
        assertThat(columns).containsExactlyInAnyOrder("id", "user_id", "created_at", "deleted_at");
    }

    @Test
    void versionNumberIsUniquePerPrompt() {
        UUID promptId = insertPromptForNewUser();
        insertVersion(promptId, 1, "medium", "off");

        assertThatThrownBy(() -> insertVersion(promptId, 1, "medium", "off"))
                .isInstanceOf(DataIntegrityViolationException.class);
    }
}
