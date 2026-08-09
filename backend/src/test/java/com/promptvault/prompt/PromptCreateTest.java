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

class PromptCreateTest extends IntegrationTest {

    private static final String BODY = """
            {
              "name": "Greeting",
              "description": "Say hi",
              "promptText": "Hello there",
              "model": "claude-opus-4-8",
              "systemPrompt": "Be friendly",
              "maxTokens": 1000,
              "effort": "medium",
              "thinking": "off"
            }
            """;

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @PersistenceContext
    private EntityManager entityManager;

    @Test
    void createsPromptOwnedByCaller() throws Exception {
        String email = "creator@example.com";
        String token = "Bearer " + TestTokens.registerAndLogin(mockMvc, email, "password123");
        UUID userId = jdbcTemplate.queryForObject("select id from users where email = ?", UUID.class, email);

        String response = mockMvc.perform(post("/api/prompts")
                        .header(HttpHeaders.AUTHORIZATION, token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(BODY))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.name").value("Greeting"))
                .andExpect(jsonPath("$.promptText").value("Hello there"))
                .andExpect(jsonPath("$.model").value("claude-opus-4-8"))
                .andReturn()
                .getResponse()
                .getContentAsString();

        UUID promptId = UUID.fromString(JsonPath.read(response, "$.promptId"));
        // The insert is still pending in the persistence context; flush so raw JDBC sees it.
        entityManager.flush();
        UUID ownerId = jdbcTemplate.queryForObject("select user_id from prompt where id = ?", UUID.class, promptId);
        assertThat(ownerId).isEqualTo(userId);
    }

    @Test
    void requiresAuthentication() throws Exception {
        mockMvc.perform(post("/api/prompts")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(BODY))
                .andExpect(status().isUnauthorized());
    }
}
