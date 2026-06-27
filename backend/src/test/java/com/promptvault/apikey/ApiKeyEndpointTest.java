package com.promptvault.apikey;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.promptvault.IntegrationTest;
import com.promptvault.support.TestTokens;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

class ApiKeyEndpointTest extends IntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    private String bearer(String email) throws Exception {
        return "Bearer " + TestTokens.registerAndLogin(mockMvc, email, "password123");
    }

    @Test
    void putStoresFirstKeyAndGetReportsHasKey() throws Exception {
        String token = bearer("key1@example.com");

        mockMvc.perform(put("/api/me/api-key")
                        .header(HttpHeaders.AUTHORIZATION, token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"apiKey\":\"sk-ant-first-key\"}"))
                .andExpect(status().isNoContent());

        mockMvc.perform(get("/api/me/api-key").header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.hasKey").value(true))
                .andExpect(jsonPath("$.updatedAt").exists())
                .andExpect(jsonPath("$.lastSix").value("st-key"));
    }

    @Test
    void putReplacesExistingKey() throws Exception {
        String token = bearer("key2@example.com");

        mockMvc.perform(put("/api/me/api-key")
                        .header(HttpHeaders.AUTHORIZATION, token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"apiKey\":\"sk-ant-first\"}"))
                .andExpect(status().isNoContent());
        mockMvc.perform(put("/api/me/api-key")
                        .header(HttpHeaders.AUTHORIZATION, token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"apiKey\":\"sk-ant-second\"}"))
                .andExpect(status().isNoContent());

        mockMvc.perform(get("/api/me/api-key").header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.hasKey").value(true));
    }

    @Test
    void getWithoutKeyReportsNoKey() throws Exception {
        String token = bearer("nokey@example.com");

        mockMvc.perform(get("/api/me/api-key").header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.hasKey").value(false))
                .andExpect(jsonPath("$.updatedAt").value(org.hamcrest.Matchers.nullValue()));
    }

    @Test
    void blankKeyRejected() throws Exception {
        String token = bearer("blank@example.com");

        mockMvc.perform(put("/api/me/api-key")
                        .header(HttpHeaders.AUTHORIZATION, token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"apiKey\":\"   \"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("validation_error"))
                .andExpect(jsonPath("$.details.apiKey").exists());
    }

    @Test
    void requiresAuthentication() throws Exception {
        mockMvc.perform(get("/api/me/api-key")).andExpect(status().isUnauthorized());
    }
}
