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

class RunSettingsValidationTest extends IntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    private String token;

    private static String body(String model, int maxTokens, String effort, String thinking, String extra) {
        return """
                {
                  "name": "Settings",
                  "promptText": "Hello",
                  "model": "%s",
                  "maxTokens": %d,
                  "effort": "%s",
                  "thinking": "%s"%s
                }
                """.formatted(model, maxTokens, effort, thinking, extra);
    }

    private ResultActions submit(String body) throws Exception {
        if (token == null) {
            token = "Bearer " + TestTokens.registerAndLogin(mockMvc, "settings@example.com", "password123");
        }
        return mockMvc.perform(post("/api/prompts")
                .header(HttpHeaders.AUTHORIZATION, token)
                .contentType(MediaType.APPLICATION_JSON)
                .content(body));
    }

    @Test
    void validSettingsPersist() throws Exception {
        submit(body("claude-opus-4-8", 1000, "high", "adaptive", "")).andExpect(status().isCreated());
    }

    @Test
    void unknownModelRejected() throws Exception {
        submit(body("gpt-5", 1000, "medium", "off", ""))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("validation_error"))
                .andExpect(jsonPath("$.details.model").exists());
    }

    @Test
    void maxTokensOutOfRangeRejected() throws Exception {
        submit(body("claude-opus-4-8", 999_999, "medium", "off", ""))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("validation_error"));
        submit(body("claude-opus-4-8", 0, "medium", "off", ""))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("validation_error"));
    }

    @Test
    void badEffortRejected() throws Exception {
        submit(body("claude-opus-4-8", 1000, "extreme", "off", ""))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.effort").exists());
    }

    @Test
    void badThinkingRejected() throws Exception {
        submit(body("claude-opus-4-8", 1000, "medium", "sometimes", ""))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.thinking").exists());
    }

    @Test
    void adaptiveThinkingOnHaikuRejected() throws Exception {
        submit(body("claude-haiku-4-5", 1000, "medium", "adaptive", ""))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.thinking").exists());
    }

    @Test
    void noTemperatureFieldAccepted() throws Exception {
        submit(body("claude-opus-4-8", 1000, "medium", "off", ",\n  \"temperature\": 0.9"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.temperature").doesNotExist());
    }
}
