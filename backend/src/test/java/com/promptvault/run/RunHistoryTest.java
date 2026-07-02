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

class RunHistoryTest extends IntegrationTest {

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

    private UUID insertRun(
            UUID userId, UUID versionId, String status, String response, Integer in, Integer out, int minutesAgo) {
        UUID runId = UUID.randomUUID();
        jdbcTemplate.update(
                "insert into run (id, user_id, version_id, rendered_prompt, response, model, input_tokens,"
                        + " output_tokens, status, created_at)"
                        + " values (?, ?, ?, 'rendered', ?, 'claude-opus-4-8', ?, ?, ?, now() - make_interval(mins => ?))",
                runId,
                userId,
                versionId,
                response,
                in,
                out,
                status,
                minutesAgo);
        return runId;
    }

    @Test
    void listsRunsAcrossVersionsWithTagsPreviewsAndAllStatuses() throws Exception {
        String token = "Bearer " + TestTokens.registerAndLogin(mockMvc, "history@example.com", "password123");
        UUID userId = userId("history@example.com");
        UUID promptId = insertPrompt(userId);
        UUID v1 = insertVersion(promptId, 1);
        UUID v2 = insertVersion(promptId, 2);
        insertRun(userId, v1, "completed", "the full answer", 10, 20, 10);
        insertRun(userId, v1, "in_progress", null, null, null, 5);
        insertRun(userId, v2, "failed", null, null, null, 1);

        mockMvc.perform(get("/api/prompts/" + promptId + "/runs").header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk())
                // newest first (v2 failed), then v1 in_progress, then v1 completed
                .andExpect(jsonPath("$.items.length()").value(3))
                .andExpect(jsonPath("$.hasMore").value(false))
                .andExpect(jsonPath("$.items[0].versionNumber").value(2))
                .andExpect(jsonPath("$.items[0].status").value("failed"))
                .andExpect(jsonPath("$.items[1].status").value("in_progress"))
                .andExpect(jsonPath("$.items[2].versionNumber").value(1))
                .andExpect(jsonPath("$.items[2].status").value("completed"))
                .andExpect(jsonPath("$.items[2].responsePreview").value("the full answer"));
    }

    @Test
    void listsRunsForOneVersion() throws Exception {
        String token = "Bearer " + TestTokens.registerAndLogin(mockMvc, "perversion@example.com", "password123");
        UUID userId = userId("perversion@example.com");
        UUID promptId = insertPrompt(userId);
        UUID v1 = insertVersion(promptId, 1);
        UUID v2 = insertVersion(promptId, 2);
        insertRun(userId, v1, "completed", "v1 answer", 1, 1, 2);
        insertRun(userId, v2, "completed", "v2 answer", 1, 1, 1);

        mockMvc.perform(get("/api/prompts/" + promptId + "/versions/1/runs").header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].versionNumber").value(1));
    }

    @Test
    void singleRunReopensWithFullDetail() throws Exception {
        String token = "Bearer " + TestTokens.registerAndLogin(mockMvc, "detail@example.com", "password123");
        UUID userId = userId("detail@example.com");
        UUID promptId = insertPrompt(userId);
        UUID v1 = insertVersion(promptId, 1);
        UUID runId = insertRun(userId, v1, "completed", "the complete answer text", 12, 34, 1);

        mockMvc.perform(get("/api/runs/" + runId).header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.runId").value(runId.toString()))
                .andExpect(jsonPath("$.versionNumber").value(1))
                .andExpect(jsonPath("$.response").value("the complete answer text"))
                .andExpect(jsonPath("$.inputTokens").value(12))
                .andExpect(jsonPath("$.outputTokens").value(34))
                .andExpect(jsonPath("$.status").value("completed"))
                .andExpect(jsonPath("$.renderedPrompt").value("rendered"));
    }

    @Test
    void crossUserRunDetailReturns404() throws Exception {
        String ownerToken = "Bearer " + TestTokens.registerAndLogin(mockMvc, "run-owner-h@example.com", "password123");
        UUID ownerId = userId("run-owner-h@example.com");
        UUID promptId = insertPrompt(ownerId);
        UUID v1 = insertVersion(promptId, 1);
        UUID runId = insertRun(ownerId, v1, "completed", "secret", 1, 1, 1);
        String otherToken = "Bearer " + TestTokens.registerAndLogin(mockMvc, "run-other-h@example.com", "password123");

        mockMvc.perform(get("/api/runs/" + runId).header(HttpHeaders.AUTHORIZATION, otherToken))
                .andExpect(status().isNotFound());
    }
}
