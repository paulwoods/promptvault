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
    void lowerEmailUniquenessRejectsCaseVariantDuplicate() {
        jdbcTemplate.update(
                "insert into users (id, email, password_hash) values (gen_random_uuid(), ?, ?)",
                "Alice@Example.com",
                "hash");

        assertThatThrownBy(() -> jdbcTemplate.update(
                        "insert into users (id, email, password_hash) values (gen_random_uuid(), ?, ?)",
                        "alice@example.com",
                        "hash"))
                .isInstanceOf(DataIntegrityViolationException.class);
    }
}
