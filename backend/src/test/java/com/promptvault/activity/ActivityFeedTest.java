package com.promptvault.activity;

import static org.hamcrest.Matchers.hasItem;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import com.promptvault.IntegrationTest;
import com.promptvault.auth.JwtService;
import com.promptvault.common.Pagination;
import com.promptvault.support.TestTokens;
import com.promptvault.user.User;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

/**
 * {@code GET /api/me/activity} (ADR-0006): owner-scoped, {@code {items, hasMore}},
 * newest first; run_started items carry the Run's live status.
 */
class ActivityFeedTest extends IntegrationTest {

    private static final int PAGE_SIZE = Pagination.PAGE_SIZE;

    private static final String PROMPT_BODY_TEMPLATE = """
            {"name":"%s","promptText":"Hello","model":"claude-opus-4-8","maxTokens":1000,"effort":"medium","thinking":"off"}
            """;

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JwtService jwtService;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @PersistenceContext
    private EntityManager entityManager;

    /** Seeds a user directly (bypassing register/login) for deterministic event counts in pagination tests. */
    private String seedUserAndToken(String email) {
        UUID userId = UUID.randomUUID();
        jdbcTemplate.update(
                "insert into users (id, email, password_hash, name) values (?, ?, 'hash', ?)", userId, email, email);
        return "Bearer " + jwtService.issue(new User(userId, email, email, "hash"));
    }

    private UUID userId(String email) {
        return jdbcTemplate.queryForObject("select id from users where email = ?", UUID.class, email);
    }

    private void insertEvent(UUID userId, String label, int minutesAgo) {
        jdbcTemplate.update(
                "insert into activity_event (id, user_id, type, label, occurred_at)"
                        + " values (?, ?, 'registered', ?, now() - make_interval(mins => ?))",
                UUID.randomUUID(),
                userId,
                label,
                minutesAgo);
    }

    private void insertEvents(UUID userId, int count) {
        for (int i = 1; i <= count; i++) {
            insertEvent(userId, "seed " + i, count - i + 1);
        }
    }

    private String createPrompt(String token, String name) throws Exception {
        String response = mockMvc.perform(post("/api/prompts")
                        .header(HttpHeaders.AUTHORIZATION, token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(PROMPT_BODY_TEMPLATE.formatted(name)))
                .andExpect(status().isCreated())
                .andReturn()
                .getResponse()
                .getContentAsString();
        return JsonPath.read(response, "$.promptId");
    }

    @Test
    void pageOneReturnsFirstPageSizeAndHasMore() throws Exception {
        String email = "activity-page1@example.com";
        String token = seedUserAndToken(email);
        insertEvents(userId(email), PAGE_SIZE + 5);

        mockMvc.perform(get("/api/me/activity").header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(PAGE_SIZE))
                .andExpect(jsonPath("$.hasMore").value(true));
    }

    @Test
    void lastPageReportsHasMoreFalse() throws Exception {
        String email = "activity-lastpage@example.com";
        String token = seedUserAndToken(email);
        insertEvents(userId(email), PAGE_SIZE + 5);

        mockMvc.perform(get("/api/me/activity").param("page", "2").header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(5))
                .andExpect(jsonPath("$.hasMore").value(false));
    }

    @Test
    void pastTheEndReturnsEmptyAndHasMoreFalse() throws Exception {
        String email = "activity-pastend@example.com";
        String token = seedUserAndToken(email);
        insertEvents(userId(email), PAGE_SIZE + 5);

        mockMvc.perform(get("/api/me/activity").param("page", "3").header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(0))
                .andExpect(jsonPath("$.hasMore").value(false));
    }

    @Test
    void crossUserIsolation() throws Exception {
        String ownerEmail = "activity-owner@example.com";
        String ownerToken = seedUserAndToken(ownerEmail);
        insertEvent(userId(ownerEmail), "Owner Event", 1);

        String otherEmail = "activity-other@example.com";
        String otherToken = seedUserAndToken(otherEmail);
        insertEvent(userId(otherEmail), "Other Event", 1);

        mockMvc.perform(get("/api/me/activity").header(HttpHeaders.AUTHORIZATION, ownerToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].label").value("Owner Event"));

        mockMvc.perform(get("/api/me/activity").header(HttpHeaders.AUTHORIZATION, otherToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].label").value("Other Event"));
    }

    @Test
    void requiresAuthentication() throws Exception {
        mockMvc.perform(get("/api/me/activity")).andExpect(status().isUnauthorized());
    }

    @Test
    void eventsForATrashedPromptRemainListedWithLabelsIntactWhileThePromptItself404s() throws Exception {
        String token = "Bearer " + TestTokens.registerAndLogin(mockMvc, "activity-trash@example.com", "password123");
        String promptId = createPrompt(token, "TrashedPrompt");

        mockMvc.perform(delete("/api/prompts/" + promptId).header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isNoContent());
        mockMvc.perform(get("/api/prompts/" + promptId).header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isNotFound());

        mockMvc.perform(get("/api/me/activity").header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[?(@.type == 'prompt_created')].label", hasItem("TrashedPrompt")))
                .andExpect(jsonPath("$.items[?(@.type == 'prompt_deleted')].label", hasItem("TrashedPrompt")));
    }

    @Test
    void runStartedItemReportsTheRunsLiveStatus() throws Exception {
        String email = "activity-runstatus@example.com";
        String token = "Bearer " + TestTokens.registerAndLogin(mockMvc, email, "password123");
        UUID userId = userId(email);
        mockMvc.perform(put("/api/me/api-key")
                        .header(HttpHeaders.AUTHORIZATION, token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"apiKey\":\"sk-ant-test\"}"))
                .andExpect(status().isNoContent());
        String promptId = createPrompt(token, "RunProm");

        mockMvc.perform(post("/api/prompts/" + promptId + "/versions/1/runs")
                .header(HttpHeaders.AUTHORIZATION, token)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"values\":{}}"));

        mockMvc.perform(get("/api/me/activity").header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[?(@.type == 'run_started')].runStatus", hasItem("in_progress")));

        // The feed reads the Run's live status via PK join, not a value frozen at write
        // time: flipping the row to completed changes what the very same event reports.
        UUID runId = jdbcTemplate.queryForObject("select id from run where user_id = ?", UUID.class, userId);
        jdbcTemplate.update("update run set status = 'completed' where id = ?", runId);
        // The Run entity from the earlier POST is still cached in this test's shared
        // persistence context; clear it so the next read goes back to the database.
        entityManager.clear();

        mockMvc.perform(get("/api/me/activity").header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[?(@.type == 'run_started')].runStatus", hasItem("completed")));
    }
}
