package com.promptvault.prompt;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import com.promptvault.IntegrationTest;
import com.promptvault.support.TestTokens;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

/**
 * Soft delete / restore / Trash (ADR-0004): 9.5.2-9.5.5. Restoring a
 * never-deleted or already-active prompt is a documented 404, matching the
 * existing owner-scoped 404 convention.
 */
class PromptDeletionTest extends IntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @PersistenceContext
    private EntityManager entityManager;

    private static String body(String name) {
        return """
                {
                  "name": "%s",
                  "description": "%s desc",
                  "promptText": "Hello",
                  "model": "claude-opus-4-8",
                  "maxTokens": 1000,
                  "effort": "medium",
                  "thinking": "off"
                }
                """.formatted(name, name);
    }

    private String createPrompt(String token, String name) throws Exception {
        String response = mockMvc.perform(post("/api/prompts")
                        .header(HttpHeaders.AUTHORIZATION, token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(name)))
                .andExpect(status().isCreated())
                .andReturn()
                .getResponse()
                .getContentAsString();
        return JsonPath.read(response, "$.promptId");
    }

    private Instant deletedAtOf(String promptId) {
        // Delete/restore mutate a managed entity via dirty checking (no explicit save());
        // flush so the raw JDBC read below sees it, mirroring RunStoreTest's pattern.
        entityManager.flush();
        return jdbcTemplate.queryForObject(
                "select deleted_at from prompt where id = ?", Instant.class, UUID.fromString(promptId));
    }

    @Test
    void deleteSetsDeletedAtAndIsIdempotent() throws Exception {
        String token = "Bearer " + TestTokens.registerAndLogin(mockMvc, "deleter@example.com", "password123");
        String promptId = createPrompt(token, "ToDelete");

        mockMvc.perform(delete("/api/prompts/" + promptId).header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isNoContent());
        assertThat(deletedAtOf(promptId)).isNotNull();

        // Deleting again must not error.
        mockMvc.perform(delete("/api/prompts/" + promptId).header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isNoContent());
        assertThat(deletedAtOf(promptId)).isNotNull();
    }

    @Test
    void deleteCrossUserReturns404AndLeavesPromptActive() throws Exception {
        String ownerToken = "Bearer " + TestTokens.registerAndLogin(mockMvc, "owner-del@example.com", "password123");
        String promptId = createPrompt(ownerToken, "Owned");
        String otherToken = "Bearer " + TestTokens.registerAndLogin(mockMvc, "intruder-del@example.com", "password123");

        mockMvc.perform(delete("/api/prompts/" + promptId).header(HttpHeaders.AUTHORIZATION, otherToken))
                .andExpect(status().isNotFound());
        assertThat(deletedAtOf(promptId)).isNull();
    }

    @Test
    void restoreReactivatesADeletedPrompt() throws Exception {
        String token = "Bearer " + TestTokens.registerAndLogin(mockMvc, "restorer@example.com", "password123");
        String promptId = createPrompt(token, "Restorable");
        mockMvc.perform(delete("/api/prompts/" + promptId).header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isNoContent());
        mockMvc.perform(get("/api/prompts/" + promptId).header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isNotFound());

        mockMvc.perform(post("/api/prompts/" + promptId + "/restore").header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isNoContent());

        assertThat(deletedAtOf(promptId)).isNull();
        mockMvc.perform(get("/api/prompts/" + promptId).header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk());
        mockMvc.perform(get("/api/prompts").header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk())
                .andExpect(
                        jsonPath("$.items[?(@.promptId == '" + promptId + "')]").isNotEmpty());
    }

    @Test
    void restoringANeverDeletedPromptReturns404() throws Exception {
        String token = "Bearer " + TestTokens.registerAndLogin(mockMvc, "neverdeleted@example.com", "password123");
        String promptId = createPrompt(token, "Active");

        mockMvc.perform(post("/api/prompts/" + promptId + "/restore").header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isNotFound());
    }

    @Test
    void restoringAnAlreadyActivePromptAgainReturns404() throws Exception {
        String token = "Bearer " + TestTokens.registerAndLogin(mockMvc, "doublerestore@example.com", "password123");
        String promptId = createPrompt(token, "DoubleRestore");
        mockMvc.perform(delete("/api/prompts/" + promptId).header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isNoContent());
        mockMvc.perform(post("/api/prompts/" + promptId + "/restore").header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isNoContent());

        // Prompt is now active again; restoring a second time 404s.
        mockMvc.perform(post("/api/prompts/" + promptId + "/restore").header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isNotFound());
    }

    @Test
    void restoreCrossUserReturns404() throws Exception {
        String ownerToken = "Bearer " + TestTokens.registerAndLogin(mockMvc, "owner-res@example.com", "password123");
        String promptId = createPrompt(ownerToken, "Owned");
        mockMvc.perform(delete("/api/prompts/" + promptId).header(HttpHeaders.AUTHORIZATION, ownerToken))
                .andExpect(status().isNoContent());
        String otherToken = "Bearer " + TestTokens.registerAndLogin(mockMvc, "intruder-res@example.com", "password123");

        mockMvc.perform(post("/api/prompts/" + promptId + "/restore").header(HttpHeaders.AUTHORIZATION, otherToken))
                .andExpect(status().isNotFound());
    }

    @Test
    void trashListsOnlyCallersDeletedPrompts() throws Exception {
        String token = "Bearer " + TestTokens.registerAndLogin(mockMvc, "trasher@example.com", "password123");
        String activeId = createPrompt(token, "StillActive");
        String deletedId = createPrompt(token, "InTrash");
        mockMvc.perform(delete("/api/prompts/" + deletedId).header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isNoContent());

        String otherToken =
                "Bearer " + TestTokens.registerAndLogin(mockMvc, "other-trasher@example.com", "password123");
        String otherDeletedId = createPrompt(otherToken, "OtherTrash");
        mockMvc.perform(delete("/api/prompts/" + otherDeletedId).header(HttpHeaders.AUTHORIZATION, otherToken))
                .andExpect(status().isNoContent());

        mockMvc.perform(get("/api/prompts/trash").header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].promptId").value(deletedId))
                .andExpect(jsonPath("$[0].name").value("InTrash"))
                .andExpect(jsonPath("$[0].deletedAt").exists())
                .andExpect(jsonPath("$[?(@.promptId == '" + activeId + "')]").isEmpty())
                .andExpect(
                        jsonPath("$[?(@.promptId == '" + otherDeletedId + "')]").isEmpty());
    }

    @Test
    void updatingATrashedPromptReturns404AndResumesAfterRestore() throws Exception {
        String token = "Bearer " + TestTokens.registerAndLogin(mockMvc, "trash-editor@example.com", "password123");
        String promptId = createPrompt(token, "TrashEdit");

        mockMvc.perform(delete("/api/prompts/" + promptId).header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isNoContent());

        // While deleted: updating is cascade-filtered (ADR-0004), like every read.
        mockMvc.perform(put("/api/prompts/" + promptId)
                        .header(HttpHeaders.AUTHORIZATION, token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("TrashEdit edited")))
                .andExpect(status().isNotFound());
        entityManager.flush();
        String nameWhileTrashed = jdbcTemplate.queryForObject(
                "select name from prompt where id = ?", String.class, UUID.fromString(promptId));
        assertThat(nameWhileTrashed).isEqualTo("TrashEdit");

        mockMvc.perform(post("/api/prompts/" + promptId + "/restore").header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isNoContent());

        // After restore: updating resolves again.
        mockMvc.perform(put("/api/prompts/" + promptId)
                        .header(HttpHeaders.AUTHORIZATION, token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("TrashEdit edited")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("TrashEdit edited"));
    }

    @Test
    void cascadeFiltersEveryReadForADeletedPromptAndResumesAfterRestore() throws Exception {
        String token = "Bearer " + TestTokens.registerAndLogin(mockMvc, "cascade@example.com", "password123");
        String promptId = createPrompt(token, "Cascaded");

        // Before delete: everything resolves.
        assertReachable(token, promptId, true);

        mockMvc.perform(delete("/api/prompts/" + promptId).header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isNoContent());

        // While deleted: everything 404s / is excluded, including running it.
        assertReachable(token, promptId, false);

        mockMvc.perform(post("/api/prompts/" + promptId + "/restore").header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isNoContent());

        // After restore: everything resolves again.
        assertReachable(token, promptId, true);
    }

    private void assertReachable(String token, String promptId, boolean reachable) throws Exception {
        mockMvc.perform(get("/api/prompts/" + promptId).header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(reachable ? status().isOk() : status().isNotFound());

        var listExpectation = reachable
                ? jsonPath("$.items[?(@.promptId == '" + promptId + "')]").isNotEmpty()
                : jsonPath("$.items[?(@.promptId == '" + promptId + "')]").isEmpty();
        mockMvc.perform(get("/api/prompts").header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk())
                .andExpect(listExpectation);
    }
}
