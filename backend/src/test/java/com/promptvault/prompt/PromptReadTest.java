package com.promptvault.prompt;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import com.promptvault.IntegrationTest;
import com.promptvault.support.TestTokens;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

class PromptReadTest extends IntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    private static String body(String name) {
        return """
                {
                  "name": "%s",
                  "description": "%s desc",
                  "promptText": "Hello",
                  "model": "claude-opus-4-8",
                  "maxTokens": 1000,
                  "effort": "medium",
                  "thinking": "off"
                }
                """.formatted(name, name);
    }

    /** Creates a prompt then overwrites it, so the read must show only the newer content. */
    private String createThenUpdate(String token) throws Exception {
        String response = mockMvc.perform(post("/api/prompts")
                        .header(HttpHeaders.AUTHORIZATION, token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("First")))
                .andExpect(status().isCreated())
                .andReturn()
                .getResponse()
                .getContentAsString();
        String promptId = JsonPath.read(response, "$.promptId");
        mockMvc.perform(put("/api/prompts/" + promptId)
                        .header(HttpHeaders.AUTHORIZATION, token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("Second")))
                .andExpect(status().isOk());
        return promptId;
    }

    @Test
    void listShowsTheCurrentName() throws Exception {
        String token = "Bearer " + TestTokens.registerAndLogin(mockMvc, "reader@example.com", "password123");
        String promptId = createThenUpdate(token);

        mockMvc.perform(get("/api/prompts").header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[?(@.promptId == '" + promptId + "')].name")
                        .value("Second"))
                .andExpect(jsonPath("$.items[?(@.promptId == '" + promptId + "')].description")
                        .value("Second desc"));
    }

    @Test
    void detailReturnsTheFullCurrentContent() throws Exception {
        String token = "Bearer " + TestTokens.registerAndLogin(mockMvc, "detail@example.com", "password123");
        String promptId = createThenUpdate(token);

        mockMvc.perform(get("/api/prompts/" + promptId).header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Second"))
                .andExpect(jsonPath("$.promptText").value("Hello"))
                .andExpect(jsonPath("$.model").value("claude-opus-4-8"))
                .andExpect(jsonPath("$.maxTokens").value(1000))
                .andExpect(jsonPath("$.effort").value("medium"))
                .andExpect(jsonPath("$.thinking").value("off"))
                .andExpect(jsonPath("$.createdAt").exists())
                .andExpect(jsonPath("$.updatedAt").exists());
    }

    /** An overwritten Prompt keeps no trace of what it used to say (ADR-0007). */
    @Test
    void thePreviousContentIsNotRetrievableAnywhere() throws Exception {
        String token = "Bearer " + TestTokens.registerAndLogin(mockMvc, "old@example.com", "password123");
        String promptId = createThenUpdate(token);

        mockMvc.perform(get("/api/prompts/" + promptId).header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Second"));
        mockMvc.perform(get("/api/prompts/" + promptId + "/versions/1").header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isNotFound());
        mockMvc.perform(get("/api/prompts/" + promptId + "/versions/current")
                        .header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isNotFound());
    }

    @Test
    void crossUserAccessReturns404AndIsolatesList() throws Exception {
        String ownerToken = "Bearer " + TestTokens.registerAndLogin(mockMvc, "owner-r@example.com", "password123");
        String promptId = createThenUpdate(ownerToken);
        String otherToken = "Bearer " + TestTokens.registerAndLogin(mockMvc, "intruder@example.com", "password123");

        mockMvc.perform(get("/api/prompts/" + promptId).header(HttpHeaders.AUTHORIZATION, otherToken))
                .andExpect(status().isNotFound());
        mockMvc.perform(put("/api/prompts/" + promptId)
                        .header(HttpHeaders.AUTHORIZATION, otherToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("Hijacked")))
                .andExpect(status().isNotFound());
        mockMvc.perform(get("/api/prompts").header(HttpHeaders.AUTHORIZATION, otherToken))
                .andExpect(status().isOk())
                .andExpect(
                        jsonPath("$.items[?(@.promptId == '" + promptId + "')]").isEmpty());
    }
}
