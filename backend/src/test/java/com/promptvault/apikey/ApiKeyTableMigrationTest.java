package com.promptvault.apikey;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.promptvault.IntegrationTest;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;

/** Verifies the V2 api_key migration applied and the 1:1 user constraint holds. */
class ApiKeyTableMigrationTest extends IntegrationTest {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void apiKeyTableExists() {
        Boolean exists = jdbcTemplate.queryForObject(
                "select exists (select 1 from information_schema.tables where table_name = 'api_key')", Boolean.class);
        assertThat(exists).isTrue();
    }

    @Test
    void oneRowPerUserEnforced() {
        UUID userId = UUID.randomUUID();
        jdbcTemplate.update(
                "insert into users (id, email, password_hash, name) values (?, ?, ?, ?)",
                userId,
                "apikey-user@example.com",
                "hash",
                "Api Key User");
        byte[] bytes = {1, 2, 3};
        jdbcTemplate.update(
                "insert into api_key (id, user_id, iv, ciphertext, auth_tag) values (?, ?, ?, ?, ?)",
                UUID.randomUUID(),
                userId,
                bytes,
                bytes,
                bytes);

        assertThatThrownBy(() -> jdbcTemplate.update(
                        "insert into api_key (id, user_id, iv, ciphertext, auth_tag) values (?, ?, ?, ?, ?)",
                        UUID.randomUUID(),
                        userId,
                        bytes,
                        bytes,
                        bytes))
                .isInstanceOf(DataIntegrityViolationException.class);
    }
}
