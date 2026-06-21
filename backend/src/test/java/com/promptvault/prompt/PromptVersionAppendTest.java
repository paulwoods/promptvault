package com.promptvault.prompt;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import com.promptvault.IntegrationTest;
import com.promptvault.support.TestTokens;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

class PromptVersionAppendTest extends IntegrationTest {

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
                  "promptText": "Hello",
                  "model": "claude-opus-4-8",
                  "maxTokens": 1000,
                  "effort": "medium",
                  "thinking": "off"
                }
                """.formatted(name);
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

    @Test
    void appendAddsNextNumber() throws Exception {
        String token = "Bearer " + TestTokens.registerAndLogin(mockMvc, "append@example.com", "password123");
        String promptId = createPrompt(token, "First");

        mockMvc.perform(post("/api/prompts/" + promptId + "/versions")
                        .header(HttpHeaders.AUTHORIZATION, token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("Second")))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.number").value(2));
    }

    @Test
    void renameCreatesNewVersionAndLeavesHistoryUnchanged() throws Exception {
        String token = "Bearer " + TestTokens.registerAndLogin(mockMvc, "rename@example.com", "password123");
        String promptId = createPrompt(token, "Original Name");

        mockMvc.perform(post("/api/prompts/" + promptId + "/versions")
                        .header(HttpHeaders.AUTHORIZATION, token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("Renamed")))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.number").value(2))
                .andExpect(jsonPath("$.name").value("Renamed"));

        // Flush pending JPA inserts so the raw JDBC reads below see both versions.
        entityManager.flush();
        UUID promptUuid = UUID.fromString(promptId);
        assertThat(jdbcTemplate.queryForObject(
                        "select name from version where prompt_id = ? and number = 1", String.class, promptUuid))
                .isEqualTo("Original Name");
        assertThat(jdbcTemplate.queryForObject(
                        "select name from version where prompt_id = ? and number = 2", String.class, promptUuid))
                .isEqualTo("Renamed");
    }

    @Test
    void crossUserAppendReturns404() throws Exception {
        String ownerToken = "Bearer " + TestTokens.registerAndLogin(mockMvc, "owner-a@example.com", "password123");
        String promptId = createPrompt(ownerToken, "Owned by A");
        String otherToken = "Bearer " + TestTokens.registerAndLogin(mockMvc, "other-b@example.com", "password123");

        mockMvc.perform(post("/api/prompts/" + promptId + "/versions")
                        .header(HttpHeaders.AUTHORIZATION, otherToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("Sneaky")))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("not_found"));
    }
}
