package com.promptvault.prompt;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
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
                  "promptText": "Hello",
                  "model": "claude-opus-4-8",
                  "maxTokens": 1000,
                  "effort": "medium",
                  "thinking": "off"
                }
                """.formatted(name);
    }

    private String createPromptWithTwoVersions(String token) throws Exception {
        String response = mockMvc.perform(post("/api/prompts")
                        .header(HttpHeaders.AUTHORIZATION, token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("First")))
                .andExpect(status().isCreated())
                .andReturn()
                .getResponse()
                .getContentAsString();
        String promptId = JsonPath.read(response, "$.promptId");
        mockMvc.perform(post("/api/prompts/" + promptId + "/versions")
                        .header(HttpHeaders.AUTHORIZATION, token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("Second")))
                .andExpect(status().isCreated());
        return promptId;
    }

    @Test
    void listShowsCurrentVersionName() throws Exception {
        String token = "Bearer " + TestTokens.registerAndLogin(mockMvc, "reader@example.com", "password123");
        String promptId = createPromptWithTwoVersions(token);

        mockMvc.perform(get("/api/prompts").header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk())
                .andExpect(
                        jsonPath("$[?(@.promptId == '" + promptId + "')].name").value("Second"))
                .andExpect(jsonPath("$[?(@.promptId == '" + promptId + "')].currentVersionNumber")
                        .value(2));
    }

    @Test
    void detailHistoryIsDescendingWithCurrentFlagged() throws Exception {
        String token = "Bearer " + TestTokens.registerAndLogin(mockMvc, "history@example.com", "password123");
        String promptId = createPromptWithTwoVersions(token);

        mockMvc.perform(get("/api/prompts/" + promptId).header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.versions[0].number").value(2))
                .andExpect(jsonPath("$.versions[0].current").value(true))
                .andExpect(jsonPath("$.versions[1].number").value(1))
                .andExpect(jsonPath("$.versions[1].current").value(false));
    }

    @Test
    void historicalVersionReadable() throws Exception {
        String token = "Bearer " + TestTokens.registerAndLogin(mockMvc, "old@example.com", "password123");
        String promptId = createPromptWithTwoVersions(token);

        mockMvc.perform(get("/api/prompts/" + promptId + "/versions/1").header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.number").value(1))
                .andExpect(jsonPath("$.name").value("First"));
    }

    @Test
    void crossUserAccessReturns404AndIsolatesList() throws Exception {
        String ownerToken = "Bearer " + TestTokens.registerAndLogin(mockMvc, "owner-r@example.com", "password123");
        String promptId = createPromptWithTwoVersions(ownerToken);
        String otherToken = "Bearer " + TestTokens.registerAndLogin(mockMvc, "intruder@example.com", "password123");

        mockMvc.perform(get("/api/prompts/" + promptId).header(HttpHeaders.AUTHORIZATION, otherToken))
                .andExpect(status().isNotFound());
        mockMvc.perform(get("/api/prompts/" + promptId + "/versions/1").header(HttpHeaders.AUTHORIZATION, otherToken))
                .andExpect(status().isNotFound());
        mockMvc.perform(get("/api/prompts").header(HttpHeaders.AUTHORIZATION, otherToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.promptId == '" + promptId + "')]").isEmpty());
    }
}
