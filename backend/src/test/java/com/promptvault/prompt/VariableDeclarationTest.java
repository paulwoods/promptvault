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

class VariableDeclarationTest extends IntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    private String token;

    private ResultActions create(String promptText, String variablesJson) throws Exception {
        if (token == null) {
            token = "Bearer " + TestTokens.registerAndLogin(mockMvc, "vars@example.com", "password123");
        }
        String body = """
                {
                  "name": "Vars",
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
    void declaredVariablesPersistWithRequiredDefaultingTrue() throws Exception {
        create(
                        "Tell me about {{topic}}",
                        "[{\"name\":\"topic\",\"description\":\"the subject\",\"defaultValue\":\"AI\"}]")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.variables[0].name").value("topic"))
                .andExpect(jsonPath("$.variables[0].description").value("the subject"))
                .andExpect(jsonPath("$.variables[0].defaultValue").value("AI"))
                .andExpect(jsonPath("$.variables[0].required").value(true));
    }

    @Test
    void duplicateDeclaredNamesRejected() throws Exception {
        create("{{topic}}", "[{\"name\":\"topic\"},{\"name\":\"topic\"}]")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("validation_error"))
                .andExpect(jsonPath("$.details.variables").exists());
    }

    @Test
    void invalidVariableNameRejected() throws Exception {
        create("hello", "[{\"name\":\"1bad\"}]")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.variables").exists());
    }
}
