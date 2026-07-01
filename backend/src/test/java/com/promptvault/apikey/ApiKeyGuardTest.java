package com.promptvault.apikey;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.promptvault.IntegrationTest;
import com.promptvault.error.NoApiKeyException;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

/** The no-key guard: presence-only, throws before any decryption. */
class ApiKeyGuardTest extends IntegrationTest {

    @Autowired
    private ApiKeyService apiKeyService;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private UUID newUser() {
        UUID id = UUID.randomUUID();
        jdbcTemplate.update(
                "insert into users (id, email, password_hash, name) values (?, ?, ?, ?)",
                id,
                "guard-" + id + "@example.com",
                "hash",
                "Guard User");
        return id;
    }

    @Test
    void noSavedKeyThrowsNoApiKey() {
        UUID userId = newUser();

        assertThatThrownBy(() -> apiKeyService.getDecryptedKey(userId)).isInstanceOf(NoApiKeyException.class);
    }

    @Test
    void savedKeyDecryptsForOwner() {
        UUID userId = newUser();
        apiKeyService.save(userId, "sk-ant-secret-key");

        assertThat(apiKeyService.getDecryptedKey(userId)).isEqualTo("sk-ant-secret-key");
    }
}
