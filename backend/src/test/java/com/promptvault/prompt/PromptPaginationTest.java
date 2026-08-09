package com.promptvault.prompt;

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

/** 9.2.1: {@code page} param on {@code GET /api/prompts}, composing with the existing {@code q} (9.1.1). */
class PromptPaginationTest extends IntegrationTest {

    private static final int PAGE_SIZE = Pagination.PAGE_SIZE;

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private UUID userId(String email) {
        return jdbcTemplate.queryForObject("select id from users where email = ?", UUID.class, email);
    }

    /** Inserts a Prompt directly (bypassing HTTP) so updated_at is controllable. */
    private void insertPrompt(UUID userId, String name, String description, int minutesAgo) {
        jdbcTemplate.update(
                "insert into prompt (id, user_id, name, description, prompt_text, model, max_tokens,"
                        + " effort, thinking, updated_at)"
                        + " values (?, ?, ?, ?, 'hi', 'claude-opus-4-8', 1000, 'medium', 'off',"
                        + " now() - make_interval(mins => ?))",
                UUID.randomUUID(),
                userId,
                name,
                description,
                minutesAgo);
    }

    /** Inserts {@code count} prompts named P01..P{count}, oldest (P01) first, so newest-first order is P{count}..P01. */
    private void insertPrompts(UUID userId, int count) {
        for (int i = 1; i <= count; i++) {
            insertPrompt(userId, "P%02d".formatted(i), "desc", count - i + 1);
        }
    }

    @Test
    void pageOneReturnsFirstPageSizePromptsAndHasMore() throws Exception {
        String token = "Bearer " + TestTokens.registerAndLogin(mockMvc, "page-one@example.com", "password123");
        insertPrompts(userId("page-one@example.com"), PAGE_SIZE + 5);

        mockMvc.perform(get("/api/prompts").header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(PAGE_SIZE))
                .andExpect(jsonPath("$.hasMore").value(true))
                .andExpect(jsonPath("$.items[0].name").value("P%02d".formatted(PAGE_SIZE + 5)));
    }

    @Test
    void lastPageReturnsRemainderAndHasMoreFalse() throws Exception {
        String token = "Bearer " + TestTokens.registerAndLogin(mockMvc, "page-last@example.com", "password123");
        insertPrompts(userId("page-last@example.com"), PAGE_SIZE + 5);

        mockMvc.perform(get("/api/prompts").param("page", "2").header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(5))
                .andExpect(jsonPath("$.hasMore").value(false))
                .andExpect(jsonPath("$.items[0].name").value("P05"));
    }

    @Test
    void requestingPastTheEndReturnsEmptyAndHasMoreFalse() throws Exception {
        String token = "Bearer " + TestTokens.registerAndLogin(mockMvc, "page-past@example.com", "password123");
        insertPrompts(userId("page-past@example.com"), PAGE_SIZE + 5);

        mockMvc.perform(get("/api/prompts").param("page", "3").header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(0))
                .andExpect(jsonPath("$.hasMore").value(false));
    }

    @Test
    void omittedPageDefaultsToPageOne() throws Exception {
        String token = "Bearer " + TestTokens.registerAndLogin(mockMvc, "page-default@example.com", "password123");
        insertPrompts(userId("page-default@example.com"), PAGE_SIZE + 5);

        mockMvc.perform(get("/api/prompts").param("page", "1").header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(PAGE_SIZE))
                .andExpect(jsonPath("$.hasMore").value(true));
    }

    @Test
    void pageComposesWithQ() throws Exception {
        String token = "Bearer " + TestTokens.registerAndLogin(mockMvc, "page-q@example.com", "password123");
        UUID userId = userId("page-q@example.com");
        // 22 matching prompts (newest = highest index) plus a handful that never match.
        for (int i = 1; i <= 22; i++) {
            insertPrompt(userId, "Zeta%02d".formatted(i), "desc", 22 - i + 1 + 10);
        }
        insertPrompt(userId, "Unrelated", "desc", 100);

        mockMvc.perform(get("/api/prompts").param("q", "zeta").header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(PAGE_SIZE))
                .andExpect(jsonPath("$.hasMore").value(true))
                .andExpect(jsonPath("$.items[0].name").value("Zeta22"));

        mockMvc.perform(get("/api/prompts")
                        .param("q", "zeta")
                        .param("page", "2")
                        .header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(2))
                .andExpect(jsonPath("$.hasMore").value(false));
    }
}
