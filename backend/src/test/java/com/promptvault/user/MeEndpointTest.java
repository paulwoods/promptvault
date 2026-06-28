package com.promptvault.user;

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

class MeEndpointTest extends IntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    private String bearer(String email) throws Exception {
        return "Bearer " + TestTokens.registerAndLogin(mockMvc, email, "password123");
    }

    @Test
    void newUserNameDefaultsToEmail() throws Exception {
        String token = bearer("newuser@example.com");

        mockMvc.perform(get("/api/me").header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value("newuser@example.com"))
                .andExpect(jsonPath("$.name").value("newuser@example.com"));
    }

    @Test
    void putNameUpdatesAndTrims() throws Exception {
        String token = bearer("rename@example.com");

        mockMvc.perform(put("/api/me/name")
                        .header(HttpHeaders.AUTHORIZATION, token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"  Paul Woods  \"}"))
                .andExpect(status().isNoContent());

        mockMvc.perform(get("/api/me").header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Paul Woods"));
    }

    @Test
    void blankNameRejected() throws Exception {
        String token = bearer("blankname@example.com");

        mockMvc.perform(put("/api/me/name")
                        .header(HttpHeaders.AUTHORIZATION, token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"   \"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("validation_error"))
                .andExpect(jsonPath("$.details.name").exists());
    }

    @Test
    void requiresAuthentication() throws Exception {
        mockMvc.perform(get("/api/me")).andExpect(status().isUnauthorized());
    }
}
