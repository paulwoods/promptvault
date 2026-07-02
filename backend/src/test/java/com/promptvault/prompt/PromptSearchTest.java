package com.promptvault.prompt;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
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

/** 9.1.1: {@code GET /api/prompts?q=term} case-insensitive substring search. */
class PromptSearchTest extends IntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    private static String body(String name, String description) {
        return """
                {
                  "name": "%s",
                  "description": "%s",
                  "promptText": "Hello",
                  "model": "claude-opus-4-8",
                  "maxTokens": 1000,
                  "effort": "medium",
                  "thinking": "off"
                }
                """.formatted(name, description);
    }

    private void createPrompt(String token, String name, String description) throws Exception {
        mockMvc.perform(post("/api/prompts")
                        .header(HttpHeaders.AUTHORIZATION, token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(name, description)))
                .andExpect(status().isCreated());
    }

    @Test
    void matchesNameSubstringCaseInsensitively() throws Exception {
        String token = "Bearer " + TestTokens.registerAndLogin(mockMvc, "searcher@example.com", "password123");
        createPrompt(token, "Email Summarizer", "summarizes emails");
        createPrompt(token, "Code Reviewer", "reviews pull requests");

        mockMvc.perform(get("/api/prompts").param("q", "email").header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].name").value("Email Summarizer"));
    }

    @Test
    void matchesDescriptionSubstring() throws Exception {
        String token = "Bearer " + TestTokens.registerAndLogin(mockMvc, "searcher-desc@example.com", "password123");
        createPrompt(token, "Alpha", "handles pull requests");
        createPrompt(token, "Beta", "handles emails");

        mockMvc.perform(get("/api/prompts").param("q", "PULL").header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(1))
                .andExpect(jsonPath("$.items[0].name").value("Alpha"));
    }

    @Test
    void nonMatchingTermExcludesThePrompt() throws Exception {
        String token = "Bearer " + TestTokens.registerAndLogin(mockMvc, "searcher-none@example.com", "password123");
        createPrompt(token, "Alpha", "alpha desc");

        mockMvc.perform(get("/api/prompts").param("q", "zzz-no-match").header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(0));
    }

    @Test
    void omittedOrBlankQReturnsFullListUnchanged() throws Exception {
        String token = "Bearer " + TestTokens.registerAndLogin(mockMvc, "searcher-omit@example.com", "password123");
        createPrompt(token, "Alpha", "alpha desc");
        createPrompt(token, "Beta", "beta desc");

        mockMvc.perform(get("/api/prompts").header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(2));

        mockMvc.perform(get("/api/prompts").param("q", "").header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(2));

        mockMvc.perform(get("/api/prompts").param("q", "   ").header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(2));
    }

    @Test
    void onlyMatchesTheCurrentVersionNotHistoricalOnesOrPromptText() throws Exception {
        String token = "Bearer " + TestTokens.registerAndLogin(mockMvc, "searcher-hist@example.com", "password123");
        String response = mockMvc.perform(post("/api/prompts")
                        .header(HttpHeaders.AUTHORIZATION, token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("OldName", "old desc")))
                .andExpect(status().isCreated())
                .andReturn()
                .getResponse()
                .getContentAsString();
        String promptId = JsonPath.read(response, "$.promptId");
        mockMvc.perform(post("/api/prompts/" + promptId + "/versions")
                        .header(HttpHeaders.AUTHORIZATION, token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("NewName", "new desc")))
                .andExpect(status().isCreated());

        // The old name is no longer the current Version's name — no match.
        mockMvc.perform(get("/api/prompts").param("q", "OldName").header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(0));

        // The current Version's name matches.
        mockMvc.perform(get("/api/prompts").param("q", "NewName").header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(1));

        // prompt_text ("Hello") is not searched.
        mockMvc.perform(get("/api/prompts").param("q", "Hello").header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(0));
    }

    @Test
    void trashedPromptsAreNeverReturnedBySearch() throws Exception {
        String token = "Bearer " + TestTokens.registerAndLogin(mockMvc, "searcher-trash@example.com", "password123");
        String response = mockMvc.perform(post("/api/prompts")
                        .header(HttpHeaders.AUTHORIZATION, token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("Trashed", "trashed desc")))
                .andExpect(status().isCreated())
                .andReturn()
                .getResponse()
                .getContentAsString();
        String promptId = JsonPath.read(response, "$.promptId");
        mockMvc.perform(delete("/api/prompts/" + promptId).header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isNoContent());

        mockMvc.perform(get("/api/prompts").param("q", "Trashed").header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(0));
    }

    @Test
    void searchIsScopedToTheCallersOwnPrompts() throws Exception {
        String ownerToken = "Bearer " + TestTokens.registerAndLogin(mockMvc, "owner-search@example.com", "password123");
        createPrompt(ownerToken, "SharedTerm Alpha", "desc");
        String otherToken = "Bearer " + TestTokens.registerAndLogin(mockMvc, "other-search@example.com", "password123");

        mockMvc.perform(get("/api/prompts").param("q", "SharedTerm").header(HttpHeaders.AUTHORIZATION, otherToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(0));
    }
}
