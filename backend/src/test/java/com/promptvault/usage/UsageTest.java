package com.promptvault.usage;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.promptvault.IntegrationTest;
import com.promptvault.claude.Usage;
import com.promptvault.support.TestTokens;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

class UsageTest extends IntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private TokenUsageRecorder recorder;

    @Autowired
    private UsageQueryService usageQueryService;

    private UUID userId(String email) {
        return jdbcTemplate.queryForObject("select id from users where email = ?", UUID.class, email);
    }

    @Test
    void repeatedRunsOnAModelAccumulateIntoOneRow() throws Exception {
        String token = "Bearer " + TestTokens.registerAndLogin(mockMvc, "usage@example.com", "password123");
        UUID userId = userId("usage@example.com");
        recorder.record(userId, "claude-opus-4-8", new Usage(10, 20));
        recorder.record(userId, "claude-opus-4-8", new Usage(5, 7));
        recorder.record(userId, "claude-haiku-4-5", new Usage(100, 200));

        mockMvc.perform(get("/api/me/usage").header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[?(@.model == 'claude-opus-4-8')].inputTokens")
                        .value(15))
                .andExpect(jsonPath("$[?(@.model == 'claude-opus-4-8')].outputTokens")
                        .value(27))
                .andExpect(jsonPath("$[?(@.model == 'claude-haiku-4-5')].inputTokens")
                        .value(100))
                .andExpect(jsonPath("$[?(@.model == 'claude-haiku-4-5')].outputTokens")
                        .value(200));
    }

    @Test
    void theFirstRunOnAModelCreatesItsRowAndLaterRunsIncrementIt() throws Exception {
        TestTokens.registerAndLogin(mockMvc, "usage-upsert@example.com", "password123");
        UUID userId = userId("usage-upsert@example.com");

        recorder.record(userId, "claude-opus-4-8", new Usage(1, 2));
        assertThat(usageQueryService.usage(userId))
                .singleElement()
                .satisfies(u -> {
                    assertThat(u.inputTokens()).isEqualTo(1);
                    assertThat(u.outputTokens()).isEqualTo(2);
                });

        recorder.record(userId, "claude-opus-4-8", new Usage(3, 4));
        assertThat(usageQueryService.usage(userId))
                .singleElement()
                .satisfies(u -> {
                    assertThat(u.inputTokens()).isEqualTo(4);
                    assertThat(u.outputTokens()).isEqualTo(6);
                });
    }

    @Test
    void crossUserIsolation() throws Exception {
        String ownerToken = "Bearer " + TestTokens.registerAndLogin(mockMvc, "usage-owner@example.com", "password123");
        UUID ownerId = userId("usage-owner@example.com");
        recorder.record(ownerId, "claude-opus-4-8", new Usage(50, 60));
        String otherToken = "Bearer " + TestTokens.registerAndLogin(mockMvc, "usage-other@example.com", "password123");

        mockMvc.perform(get("/api/me/usage").header(HttpHeaders.AUTHORIZATION, otherToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));

        mockMvc.perform(get("/api/me/usage").header(HttpHeaders.AUTHORIZATION, ownerToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].inputTokens").value(50));
    }

    @Test
    void newUserWithNoRunsGetsEmptyList() throws Exception {
        String token = "Bearer " + TestTokens.registerAndLogin(mockMvc, "usage-empty@example.com", "password123");

        mockMvc.perform(get("/api/me/usage").header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void requiresAuthentication() throws Exception {
        mockMvc.perform(get("/api/me/usage")).andExpect(status().isUnauthorized());
    }
}
