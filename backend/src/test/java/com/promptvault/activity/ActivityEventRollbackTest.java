package com.promptvault.activity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.promptvault.AbstractDatabaseTest;
import com.promptvault.auth.JwtService;
import com.promptvault.user.User;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

/**
 * ADR-0006: an activity_event insert failure fails the mutation, with no
 * special-casing — proven by substituting an {@link ActivityRecorder} that
 * always fails the write and confirming the caller's own write never lands
 * either. The user is seeded directly and a token minted via {@link
 * JwtService} rather than through the (also-instrumented) register/login
 * endpoints, so test setup doesn't itself hit the forced failure.
 *
 * <p>Not transactional (unlike {@code IntegrationTest}): a per-test rollback
 * would hide the very thing under test, since {@code UserService.updateName}'s
 * own {@code @Transactional} would just join the outer test transaction rather
 * than commit or roll back for real. Truncates instead, like {@code
 * RunServiceTest}/{@code DurabilityTest}.
 */
@AutoConfigureMockMvc
@Import(ActivityEventRollbackTest.FailingActivityRecorderConfig.class)
class ActivityEventRollbackTest extends AbstractDatabaseTest {

    @TestConfiguration
    static class FailingActivityRecorderConfig {
        @Bean
        @Primary
        ActivityRecorder failingActivityRecorder() {
            return new ActivityRecorder(null) {
                @Override
                public void record(UUID userId, String type, String label) {
                    throw new DataIntegrityViolationException("forced activity_event failure");
                }
            };
        }
    }

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JwtService jwtService;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @AfterEach
    void cleanup() {
        jdbcTemplate.execute("truncate table activity_event, users cascade");
    }

    @Test
    void nameChangeIsRolledBackWhenTheActivityEventInsertFails() throws Exception {
        UUID userId = UUID.randomUUID();
        String email = "act-rollback@example.com";
        jdbcTemplate.update(
                "insert into users (id, email, password_hash, name) values (?, ?, 'hash', ?)", userId, email, email);
        String token = "Bearer " + jwtService.issue(new User(userId, email, email, "hash"));

        mockMvc.perform(put("/api/me/name")
                        .header(HttpHeaders.AUTHORIZATION, token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Should Not Stick\"}"))
                .andExpect(status().isConflict());

        String name = jdbcTemplate.queryForObject("select name from users where id = ?", String.class, userId);
        assertThat(name).isEqualTo(email);
    }
}
