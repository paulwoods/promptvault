package com.promptvault;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;

/** Verifies the V1 users migration applied and lower(email) uniqueness holds. */
class UsersTableMigrationTest extends IntegrationTest {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void usersTableExists() {
        Boolean exists = jdbcTemplate.queryForObject(
                "select exists (select 1 from information_schema.tables where table_name = 'users')", Boolean.class);
        assertThat(exists).isTrue();
    }

    @Test
    void googleOnlyUserNeedsNoPassword() {
        jdbcTemplate.update(
                "insert into users (id, email, name, google_sub) values (gen_random_uuid(), ?, ?, ?)",
                "google-only@example.com",
                "Google Only",
                "sub-google-only");

        Integer count = jdbcTemplate.queryForObject(
                "select count(*) from users where google_sub = ?", Integer.class, "sub-google-only");
        assertThat(count).isEqualTo(1);
    }

    /** ck_users_has_credential: every User holds at least one Login Method (ADR-0011). */
    @Test
    void userWithNeitherPasswordNorGoogleIsRejected() {
        assertThatThrownBy(() -> jdbcTemplate.update(
                        "insert into users (id, email, name) values (gen_random_uuid(), ?, ?)",
                        "credentialless@example.com",
                        "Nobody"))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void googleSubUniquenessRejectsDuplicate() {
        jdbcTemplate.update(
                "insert into users (id, email, name, google_sub) values (gen_random_uuid(), ?, ?, ?)",
                "first@example.com",
                "First",
                "sub-shared");

        assertThatThrownBy(() -> jdbcTemplate.update(
                        "insert into users (id, email, name, google_sub) values (gen_random_uuid(), ?, ?, ?)",
                        "second@example.com",
                        "Second",
                        "sub-shared"))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void lowerEmailUniquenessRejectsCaseVariantDuplicate() {
        jdbcTemplate.update(
                "insert into users (id, email, password_hash, name) values (gen_random_uuid(), ?, ?, ?)",
                "Alice@Example.com",
                "hash",
                "Alice");

        assertThatThrownBy(() -> jdbcTemplate.update(
                        "insert into users (id, email, password_hash, name) values (gen_random_uuid(), ?, ?, ?)",
                        "alice@example.com",
                        "hash",
                        "Alice"))
                .isInstanceOf(DataIntegrityViolationException.class);
    }
}
