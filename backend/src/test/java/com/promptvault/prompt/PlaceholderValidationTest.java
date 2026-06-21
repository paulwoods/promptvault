package com.promptvault.prompt;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.promptvault.IntegrationTest;
import com.promptvault.support.TestTokens;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

class PlaceholderValidationTest extends IntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    private String token;

    private ResultActions create(String promptText, String variablesJson) throws Exception {
        if (token == null) {
            token = "Bearer " + TestTokens.registerAndLogin(mockMvc, "placeholders@example.com", "password123");
        }
        String body = """
                {
                  "name": "Placeholders",
                  "promptText": "%s",
                  "model": "claude-opus-4-8",
                  "maxTokens": 1000,
                  "effort": "medium",
                  "thinking": "off",
                  "variables": %s
                }
                """.formatted(promptText, variablesJson);
        return mockMvc.perform(post("/api/prompts")
                .header(HttpHeaders.AUTHORIZATION, token)
                .contentType(MediaType.APPLICATION_JSON)
                .content(body));
    }

    @Test
    void placeholderWithoutDeclarationRejected() throws Exception {
        create("Tell me about {{topic}}", "[]")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("validation_error"));
    }

    @Test
    void declaredButUnusedVariableRejected() throws Exception {
        create("No placeholders here", "[{\"name\":\"topic\"}]")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("validation_error"));
    }

    @Test
    void malformedPlaceholderRejected() throws Exception {
        create("Broken {{1bad}}", "[]")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.promptText").exists());
    }

    @Test
    void surroundingWhitespaceTolerated() throws Exception {
        create("Tell me about {{ topic }}", "[{\"name\":\"topic\"}]").andExpect(status().isCreated());
    }

    @Test
    void duplicatePlaceholderCountedOnce() throws Exception {
        create("{{topic}} and again {{topic}}", "[{\"name\":\"topic\"}]").andExpect(status().isCreated());
    }

    @Test
    void matchingSetsAccepted() throws Exception {
        create("{{a}} then {{b}}", "[{\"name\":\"a\"},{\"name\":\"b\"}]").andExpect(status().isCreated());
    }

    @Test
    void bothEmptyAccepted() throws Exception {
        create("No variables at all", "[]").andExpect(status().isCreated());
    }
}
