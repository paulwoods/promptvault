package com.promptvault.run;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.promptvault.IntegrationTest;
import com.promptvault.common.Pagination;
import com.promptvault.support.TestTokens;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

/** 9.2.2: {@code page} param on both run-history reads, composing with the existing {@code status} (9.1.2). */
class RunPaginationTest extends IntegrationTest {

    private static final int PAGE_SIZE = Pagination.PAGE_SIZE;

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

    private void insertRun(UUID userId, UUID versionId, String status, int minutesAgo) {
        jdbcTemplate.update(
                "insert into run (id, user_id, version_id, rendered_prompt, model, status, created_at)"
                        + " values (?, ?, ?, 'rendered', 'claude-opus-4-8', ?, now() - make_interval(mins => ?))",
                UUID.randomUUID(),
                userId,
                versionId,
                status,
                minutesAgo);
    }

    /** Inserts {@code count} completed runs, oldest first, so newest-first order is run{count}..run1. */
    private void insertRuns(UUID userId, UUID versionId, int count) {
        for (int i = 1; i <= count; i++) {
            insertRun(userId, versionId, "completed", count - i + 1);
        }
    }

    @Test
    void pageOneOnPerPromptListReturnsFirstPageSizeAndHasMore() throws Exception {
        String token = "Bearer " + TestTokens.registerAndLogin(mockMvc, "run-page-prompt@example.com", "password123");
        UUID userId = userId("run-page-prompt@example.com");
        UUID promptId = insertPrompt(userId);
        UUID v1 = insertVersion(promptId, 1);
        insertRuns(userId, v1, PAGE_SIZE + 5);

        mockMvc.perform(get("/api/prompts/" + promptId + "/runs").header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(PAGE_SIZE))
                .andExpect(jsonPath("$.hasMore").value(true));
    }

    @Test
    void lastPageOnPerPromptListReportsHasMoreFalse() throws Exception {
        String token =
                "Bearer " + TestTokens.registerAndLogin(mockMvc, "run-page-prompt-last@example.com", "password123");
        UUID userId = userId("run-page-prompt-last@example.com");
        UUID promptId = insertPrompt(userId);
        UUID v1 = insertVersion(promptId, 1);
        insertRuns(userId, v1, PAGE_SIZE + 5);

        mockMvc.perform(get("/api/prompts/" + promptId + "/runs")
                        .param("page", "2")
                        .header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(5))
                .andExpect(jsonPath("$.hasMore").value(false));
    }

    @Test
    void pastTheEndOnPerPromptListReturnsEmptyAndHasMoreFalse() throws Exception {
        String token =
                "Bearer " + TestTokens.registerAndLogin(mockMvc, "run-page-prompt-past@example.com", "password123");
        UUID userId = userId("run-page-prompt-past@example.com");
        UUID promptId = insertPrompt(userId);
        UUID v1 = insertVersion(promptId, 1);
        insertRuns(userId, v1, PAGE_SIZE + 5);

        mockMvc.perform(get("/api/prompts/" + promptId + "/runs")
                        .param("page", "3")
                        .header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(0))
                .andExpect(jsonPath("$.hasMore").value(false));
    }

    @Test
    void pageOneOnPerVersionListReturnsFirstPageSizeAndHasMore() throws Exception {
        String token = "Bearer " + TestTokens.registerAndLogin(mockMvc, "run-page-version@example.com", "password123");
        UUID userId = userId("run-page-version@example.com");
        UUID promptId = insertPrompt(userId);
        UUID v1 = insertVersion(promptId, 1);
        insertRuns(userId, v1, PAGE_SIZE + 5);

        mockMvc.perform(get("/api/prompts/" + promptId + "/versions/1/runs").header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(PAGE_SIZE))
                .andExpect(jsonPath("$.hasMore").value(true));
    }

    @Test
    void lastPageOnPerVersionListReportsHasMoreFalse() throws Exception {
        String token =
                "Bearer " + TestTokens.registerAndLogin(mockMvc, "run-page-version-last@example.com", "password123");
        UUID userId = userId("run-page-version-last@example.com");
        UUID promptId = insertPrompt(userId);
        UUID v1 = insertVersion(promptId, 1);
        insertRuns(userId, v1, PAGE_SIZE + 5);

        mockMvc.perform(get("/api/prompts/" + promptId + "/versions/1/runs")
                        .param("page", "2")
                        .header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(5))
                .andExpect(jsonPath("$.hasMore").value(false));
    }

    @Test
    void pageComposesWithStatusOnPerPromptList() throws Exception {
        String token = "Bearer " + TestTokens.registerAndLogin(mockMvc, "run-page-status@example.com", "password123");
        UUID userId = userId("run-page-status@example.com");
        UUID promptId = insertPrompt(userId);
        UUID v1 = insertVersion(promptId, 1);
        // 22 completed runs (newest = minutesAgo 1) plus a few failed runs that must never be counted.
        for (int i = 1; i <= 22; i++) {
            insertRun(userId, v1, "completed", 22 - i + 1 + 10);
        }
        insertRun(userId, v1, "failed", 200);
        insertRun(userId, v1, "failed", 201);

        mockMvc.perform(get("/api/prompts/" + promptId + "/runs")
                        .param("status", "completed")
                        .header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(PAGE_SIZE))
                .andExpect(jsonPath("$.hasMore").value(true));

        mockMvc.perform(get("/api/prompts/" + promptId + "/runs")
                        .param("status", "completed")
                        .param("page", "2")
                        .header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(2))
                .andExpect(jsonPath("$.hasMore").value(false));
    }
}
