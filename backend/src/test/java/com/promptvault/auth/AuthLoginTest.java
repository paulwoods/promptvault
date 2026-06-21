package com.promptvault.auth;

import static org.hamcrest.Matchers.matchesPattern;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.promptvault.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

class AuthLoginTest extends IntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    private void register(String email, String password) throws Exception {
        mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"%s\",\"password\":\"%s\"}".formatted(email, password)))
                .andExpect(status().isCreated());
    }

    private org.springframework.test.web.servlet.ResultActions login(String email, String password) throws Exception {
        return mockMvc.perform(post("/api/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"%s\",\"password\":\"%s\"}".formatted(email, password)));
    }

    @Test
    void validCredentialsReturnAToken() throws Exception {
        register("login@example.com", "password123");

        // A JWT is three base64url segments separated by dots.
        login("login@example.com", "password123")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token", matchesPattern("[^.]+\\.[^.]+\\.[^.]+")));
    }

    @Test
    void wrongPasswordReturnsGeneric401() throws Exception {
        register("wrongpw@example.com", "password123");

        login("wrongpw@example.com", "not-the-password")
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("unauthorized"))
                .andExpect(jsonPath("$.message").value("Invalid email or password"));
    }

    @Test
    void unknownEmailReturnsGeneric401() throws Exception {
        login("nobody@example.com", "password123")
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("unauthorized"))
                .andExpect(jsonPath("$.message").value("Invalid email or password"));
    }
}
