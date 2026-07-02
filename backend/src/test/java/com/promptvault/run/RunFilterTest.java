package com.promptvault.run;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
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

/** 9.1.2: the {@code status} filter on the two run-history reads. */
class RunFilterTest extends IntegrationTest {

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

    private UUID insertRun(UUID userId, UUID versionId, String status, int minutesAgo) {
        UUID runId = UUID.randomUUID();
        jdbcTemplate.update(
                "insert into run (id, user_id, version_id, rendered_prompt, model, status, created_at)"
                        + " values (?, ?, ?, 'rendered', 'claude-opus-4-8', ?, now() - make_interval(mins => ?))",
                runId,
                userId,
                versionId,
                status,
                minutesAgo);
        return runId;
    }

    @Test
    void statusFilterOnPerPromptListReturnsOnlyMatchingRuns() throws Exception {
        String token = "Bearer " + TestTokens.registerAndLogin(mockMvc, "filter-prompt@example.com", "password123");
        UUID userId = userId("filter-prompt@example.com");
        UUID promptId = insertPrompt(userId);
        UUID v1 = insertVersion(promptId, 1);
        insertRun(userId, v1, "completed", 10);
        insertRun(userId, v1, "in_progress", 5);
        insertRun(userId, v1, "failed", 1);

        mockMvc.perform(get("/api/prompts/" + promptId + "/runs")
                        .param("status", "completed")
                        .header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].status").value("completed"));
    }

    @Test
    void statusFilterOnPerVersionListReturnsOnlyMatchingRuns() throws Exception {
        String token = "Bearer " + TestTokens.registerAndLogin(mockMvc, "filter-version@example.com", "password123");
        UUID userId = userId("filter-version@example.com");
        UUID promptId = insertPrompt(userId);
        UUID v1 = insertVersion(promptId, 1);
        insertRun(userId, v1, "completed", 10);
        insertRun(userId, v1, "in_progress", 5);
        insertRun(userId, v1, "failed", 1);

        mockMvc.perform(get("/api/prompts/" + promptId + "/versions/1/runs")
                        .param("status", "failed")
                        .header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].status").value("failed"));
    }

    @Test
    void omittedStatusReturnsAllStatusesUnchanged() throws Exception {
        String token = "Bearer " + TestTokens.registerAndLogin(mockMvc, "filter-omit@example.com", "password123");
        UUID userId = userId("filter-omit@example.com");
        UUID promptId = insertPrompt(userId);
        UUID v1 = insertVersion(promptId, 1);
        insertRun(userId, v1, "completed", 10);
        insertRun(userId, v1, "in_progress", 5);
        insertRun(userId, v1, "failed", 1);

        mockMvc.perform(get("/api/prompts/" + promptId + "/runs").header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(3));
        mockMvc.perform(get("/api/prompts/" + promptId + "/versions/1/runs").header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(3));
    }

    @Test
    void unknownStatusValueIsAValidationError() throws Exception {
        String token = "Bearer " + TestTokens.registerAndLogin(mockMvc, "filter-bogus@example.com", "password123");
        UUID userId = userId("filter-bogus@example.com");
        UUID promptId = insertPrompt(userId);
        insertVersion(promptId, 1);

        mockMvc.perform(get("/api/prompts/" + promptId + "/runs")
                        .param("status", "bogus")
                        .header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("validation_error"))
                .andExpect(jsonPath("$.details.status").value("Invalid status: bogus"));

        mockMvc.perform(get("/api/prompts/" + promptId + "/versions/1/runs")
                        .param("status", "bogus")
                        .header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("validation_error"));
    }

    @Test
    void statusFilterStillRespectsOwnerScoping() throws Exception {
        String ownerToken = "Bearer " + TestTokens.registerAndLogin(mockMvc, "filter-owner@example.com", "password123");
        UUID ownerId = userId("filter-owner@example.com");
        UUID promptId = insertPrompt(ownerId);
        UUID v1 = insertVersion(promptId, 1);
        insertRun(ownerId, v1, "completed", 10);
        String otherToken =
                "Bearer " + TestTokens.registerAndLogin(mockMvc, "filter-intruder@example.com", "password123");

        mockMvc.perform(get("/api/prompts/" + promptId + "/runs")
                        .param("status", "completed")
                        .header(HttpHeaders.AUTHORIZATION, otherToken))
                .andExpect(status().isNotFound());
    }

    @Test
    void statusFilterStillRespectsDeletionCascade() throws Exception {
        String token = "Bearer " + TestTokens.registerAndLogin(mockMvc, "filter-cascade@example.com", "password123");
        UUID userId = userId("filter-cascade@example.com");
        UUID promptId = insertPrompt(userId);
        UUID v1 = insertVersion(promptId, 1);
        insertRun(userId, v1, "completed", 10);

        mockMvc.perform(delete("/api/prompts/" + promptId).header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isNoContent());

        mockMvc.perform(get("/api/prompts/" + promptId + "/runs")
                        .param("status", "completed")
                        .header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isNotFound());
        mockMvc.perform(get("/api/prompts/" + promptId + "/versions/1/runs")
                        .param("status", "completed")
                        .header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isNotFound());
    }
}
