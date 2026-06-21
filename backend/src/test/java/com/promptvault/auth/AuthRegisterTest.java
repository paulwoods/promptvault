package com.promptvault.auth;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.promptvault.IntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

class AuthRegisterTest extends IntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    private void register(String email, String password) throws Exception {
        mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"%s\",\"password\":\"%s\"}".formatted(email, password)))
                .andExpect(status().isCreated());
    }

    @Test
    void registersUser() throws Exception {
        mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"new@example.com\",\"password\":\"password123\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").exists())
                .andExpect(jsonPath("$.email").value("new@example.com"));
    }

    @Test
    void rejectsCaseVariantDuplicateEmail() throws Exception {
        register("Dup@Example.com", "password123");

        mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"dup@example.com\",\"password\":\"password123\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("conflict"));
    }

    @Test
    void rejectsTooShortPassword() throws Exception {
        mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"short@example.com\",\"password\":\"abc\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("validation_error"))
                .andExpect(jsonPath("$.details.password").exists());
    }

    @Test
    void rejectsTooLongPassword() throws Exception {
        String longPassword = "a".repeat(73);
        mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"long@example.com\",\"password\":\"%s\"}".formatted(longPassword)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("validation_error"));
    }
}
