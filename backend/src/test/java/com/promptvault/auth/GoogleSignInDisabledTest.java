package com.promptvault.auth;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.promptvault.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

/**
 * The default test context sets no client id, which is exactly the unconfigured
 * deployment: the app boots, the SPA is told there is no Google button, and an
 * attempt anyway is reported as "off", not as a failed login (ADR-0011).
 */
class GoogleSignInDisabledTest extends IntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void configReportsNoClientId() throws Exception {
        mockMvc.perform(get("/api/auth/config"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.googleClientId").doesNotExist());
    }

    @Test
    void signingInWithGoogleIsUnavailableRatherThanUnauthorized() throws Exception {
        mockMvc.perform(post("/api/auth/google")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"idToken\":\"an-id-token\"}"))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.error").value("google_not_configured"));
    }

    @Test
    void passwordLoginStillWorks() throws Exception {
        String body = "{\"email\":\"nogoogle@example.com\",\"password\":\"password123\"}";
        mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isCreated());

        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk());
    }
}
