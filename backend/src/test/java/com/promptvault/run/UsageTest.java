package com.promptvault.run;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.promptvault.IntegrationTest;
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

    private UUID userId(String email) {
        return jdbcTemplate.queryForObject("select id from users where email = ?", UUID.class, email);
    }

    private UUID insertPrompt(UUID userId) {
        UUID promptId = UUID.randomUUID();
        jdbcTemplate.update("insert into prompt (id, user_id) values (?, ?)", promptId, userId);
        return promptId;
    }

    private UUID insertVersion(UUID promptId, int number) {
        UUID versionId = UUID.randomUUID();
        jdbcTemplate.update(
                "insert into version (id, prompt_id, number, name, prompt_text, model, max_tokens, effort, thinking)"
                        + " values (?, ?, ?, 'v', 'hi', 'claude-opus-4-8', 1000, 'medium', 'off')",
                versionId,
                promptId,
                number);
        return versionId;
    }

    private void insertRun(UUID userId, UUID versionId, String model, String status, Integer in, Integer out) {
        UUID runId = UUID.randomUUID();
        jdbcTemplate.update(
                "insert into run (id, user_id, version_id, rendered_prompt, model, input_tokens, output_tokens,"
                        + " status)"
                        + " values (?, ?, ?, 'rendered', ?, ?, ?, ?)",
                runId,
                userId,
                versionId,
                model,
                in,
                out,
                status);
    }

    @Test
    void totalsAreSummedPerModelAcrossAllStatuses() throws Exception {
        String token = "Bearer " + TestTokens.registerAndLogin(mockMvc, "usage@example.com", "password123");
        UUID userId = userId("usage@example.com");
        UUID promptId = insertPrompt(userId);
        UUID v1 = insertVersion(promptId, 1);
        insertRun(userId, v1, "claude-opus-4-8", "completed", 10, 20);
        insertRun(userId, v1, "claude-opus-4-8", "completed", 5, 7);
        insertRun(userId, v1, "claude-opus-4-8", "in_progress", null, null);
        insertRun(userId, v1, "claude-haiku-4-5", "completed", 100, 200);
        insertRun(userId, v1, "claude-haiku-4-5", "failed", null, null);

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
    void includesRunsFromDifferentPromptsAndVersions() throws Exception {
        String token = "Bearer " + TestTokens.registerAndLogin(mockMvc, "usage-multi@example.com", "password123");
        UUID userId = userId("usage-multi@example.com");
        UUID promptA = insertPrompt(userId);
        UUID promptB = insertPrompt(userId);
        UUID vA = insertVersion(promptA, 1);
        UUID vB = insertVersion(promptB, 1);
        insertRun(userId, vA, "claude-opus-4-8", "completed", 1, 2);
        insertRun(userId, vB, "claude-opus-4-8", "completed", 3, 4);

        mockMvc.perform(get("/api/me/usage").header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].model").value("claude-opus-4-8"))
                .andExpect(jsonPath("$[0].inputTokens").value(4))
                .andExpect(jsonPath("$[0].outputTokens").value(6));
    }

    @Test
    void crossUserIsolation() throws Exception {
        String ownerToken = "Bearer " + TestTokens.registerAndLogin(mockMvc, "usage-owner@example.com", "password123");
        UUID ownerId = userId("usage-owner@example.com");
        UUID promptId = insertPrompt(ownerId);
        UUID v1 = insertVersion(promptId, 1);
        insertRun(ownerId, v1, "claude-opus-4-8", "completed", 50, 60);
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
