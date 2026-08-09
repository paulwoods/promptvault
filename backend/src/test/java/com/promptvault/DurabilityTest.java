package com.promptvault;

import static org.assertj.core.api.Assertions.assertThat;

import com.github.f4b6a3.uuid.UuidCreator;
import com.promptvault.user.User;
import com.promptvault.user.UserRepository;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Durability is a property of the persistence stack (real Postgres, Flyway,
 * committed JPA txns), not new machinery: write data, "restart" by booting a
 * second context against the same Postgres, and confirm the data is intact and
 * startup is clean under ddl-auto=validate + Flyway on the populated DB.
 */
class DurabilityTest extends AbstractDatabaseTest {

    @Autowired
    private UserRepository users;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @AfterEach
    void cleanup() {
        jdbcTemplate.execute("truncate table token_usage, prompt, api_key, users cascade");
    }

    @Test
    void dataPersistsAcrossRestartWithCleanValidation() {
        UUID userId = UuidCreator.getTimeOrderedEpoch();
        users.save(new User(userId, "durable@example.com", "durable@example.com", "hash"));

        // Command-line args take highest precedence: force the test profile (over the
        // default dev) and point the datasource at the shared container.
        try (ConfigurableApplicationContext restarted = new SpringApplicationBuilder(BackendApplication.class)
                .web(WebApplicationType.NONE)
                .run(
                        "--spring.profiles.active=test",
                        "--spring.datasource.url=" + SharedPostgres.CONTAINER.getJdbcUrl(),
                        "--spring.datasource.username=" + SharedPostgres.CONTAINER.getUsername(),
                        "--spring.datasource.password=" + SharedPostgres.CONTAINER.getPassword())) {
            // The second boot completing proves Flyway re-validated and ddl-auto=validate
            // passed on the populated DB (no re-migration, no schema-drift failure).
            UserRepository restartedUsers = restarted.getBean(UserRepository.class);
            assertThat(restartedUsers.findById(userId)).isPresent();
            assertThat(restartedUsers.findByEmailNormalized("durable@example.com"))
                    .isPresent()
                    .get()
                    .extracting(User::getEmail)
                    .isEqualTo("durable@example.com");
        }
    }
}
