package com.promptvault.prompt;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.promptvault.IntegrationTest;
import com.promptvault.support.TestTokens;
import org.hamcrest.Matchers;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.test.web.servlet.MockMvc;

class ModelsEndpointTest extends IntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void returnsSupportedModelsWithCapabilities() throws Exception {
        String token = "Bearer " + TestTokens.registerAndLogin(mockMvc, "models@example.com", "password123");

        mockMvc.perform(get("/api/models").header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.defaultModel").value("claude-opus-4-8"))
                .andExpect(jsonPath("$.models[*].id", Matchers.hasItems("claude-opus-4-8", "claude-haiku-4-5")))
                .andExpect(jsonPath("$.models[?(@.id == 'claude-haiku-4-5')].supportsEffort")
                        .value(false))
                .andExpect(jsonPath("$.models[?(@.id == 'claude-haiku-4-5')].supportsAdaptiveThinking")
                        .value(false))
                .andExpect(jsonPath("$.models[?(@.id == 'claude-opus-4-8')].supportsAdaptiveThinking")
                        .value(true));
    }

    @Test
    void requiresAuthentication() throws Exception {
        mockMvc.perform(get("/api/models")).andExpect(status().isUnauthorized());
    }
}
