package com.promptvault.prompt;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
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

    private UUID versionIdOf(String promptId) {
        entityManager.flush();
        return jdbcTemplate.queryForObject(
                "select id from version where prompt_id = ?", UUID.class, UUID.fromString(promptId));
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
    void deletingPromptWithInProgressRunIsUnconditional() throws Exception {
        String token = "Bearer " + TestTokens.registerAndLogin(mockMvc, "inprog@example.com", "password123");
        UUID userId =
                jdbcTemplate.queryForObject("select id from users where email = ?", UUID.class, "inprog@example.com");
        String promptId = createPrompt(token, "HasRun");
        UUID versionId = versionIdOf(promptId);
        jdbcTemplate.update(
                "insert into run (id, user_id, version_id, rendered_prompt, model, status)"
                        + " values (?, ?, ?, 'rendered', 'claude-opus-4-8', 'in_progress')",
                UUID.randomUUID(),
                userId,
                versionId);

        mockMvc.perform(delete("/api/prompts/" + promptId).header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isNoContent());
        assertThat(deletedAtOf(promptId)).isNotNull();
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
    void addVersionToATrashedPromptReturns404AndResumesAfterRestore() throws Exception {
        String token = "Bearer " + TestTokens.registerAndLogin(mockMvc, "trash-editor@example.com", "password123");
        String promptId = createPrompt(token, "TrashEdit");

        mockMvc.perform(delete("/api/prompts/" + promptId).header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isNoContent());

        // While deleted: appending a Version is cascade-filtered (ADR-0004), like every read.
        mockMvc.perform(post("/api/prompts/" + promptId + "/versions")
                        .header(HttpHeaders.AUTHORIZATION, token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("TrashEdit v2")))
                .andExpect(status().isNotFound());
        entityManager.flush();
        Integer versionCount = jdbcTemplate.queryForObject(
                "select count(*) from version where prompt_id = ?", Integer.class, UUID.fromString(promptId));
        assertThat(versionCount).isEqualTo(1);

        mockMvc.perform(post("/api/prompts/" + promptId + "/restore").header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isNoContent());

        // After restore: appending resolves again and numbering continues from 1.
        mockMvc.perform(post("/api/prompts/" + promptId + "/versions")
                        .header(HttpHeaders.AUTHORIZATION, token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("TrashEdit v2")))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.number").value(2));
    }

    @Test
    void cascadeFiltersAllReadsForADeletedPromptAndResumesAfterRestore() throws Exception {
        String token = "Bearer " + TestTokens.registerAndLogin(mockMvc, "cascade@example.com", "password123");
        UUID userId =
                jdbcTemplate.queryForObject("select id from users where email = ?", UUID.class, "cascade@example.com");
        String promptId = createPrompt(token, "Cascaded");
        UUID versionId = versionIdOf(promptId);
        UUID runId = UUID.randomUUID();
        jdbcTemplate.update(
                "insert into run (id, user_id, version_id, rendered_prompt, model, status)"
                        + " values (?, ?, ?, 'rendered', 'claude-opus-4-8', 'completed')",
                runId,
                userId,
                versionId);

        // Before delete: everything resolves.
        assertAllReachable(token, promptId, runId, true);

        mockMvc.perform(delete("/api/prompts/" + promptId).header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isNoContent());

        // While deleted: everything 404s / is excluded.
        assertAllReachable(token, promptId, runId, false);

        mockMvc.perform(post("/api/prompts/" + promptId + "/restore").header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isNoContent());

        // After restore: everything resolves again.
        assertAllReachable(token, promptId, runId, true);
    }

    private void assertAllReachable(String token, String promptId, UUID runId, boolean reachable) throws Exception {
        var expected = reachable ? status().isOk() : status().isNotFound();

        mockMvc.perform(get("/api/prompts/" + promptId).header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(expected);
        mockMvc.perform(get("/api/prompts/" + promptId + "/versions/1").header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(expected);
        mockMvc.perform(get("/api/prompts/" + promptId + "/runs").header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(expected);
        mockMvc.perform(get("/api/prompts/" + promptId + "/versions/1/runs").header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(expected);
        mockMvc.perform(get("/api/runs/" + runId).header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(expected);

        var listExpectation = reachable
                ? jsonPath("$.items[?(@.promptId == '" + promptId + "')]").isNotEmpty()
                : jsonPath("$.items[?(@.promptId == '" + promptId + "')]").isEmpty();
        mockMvc.perform(get("/api/prompts").header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk())
                .andExpect(listExpectation);
    }
}
