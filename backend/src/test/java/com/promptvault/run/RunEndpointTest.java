package com.promptvault.run;

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

/**
 * Endpoint-level checks for the synchronous prep that runs before streaming
 * (and so returns JSON, not SSE): the no-key guard, owner scoping, and Variable
 * validation. The happy-path streaming itself is covered by {@link RunStreamerTest}.
 */
class RunEndpointTest extends IntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    private String createPrompt(String token, String promptText, String variablesJson) throws Exception {
        String body = """
                {"name":"P","promptText":"%s","model":"claude-opus-4-8","maxTokens":1000,"effort":"medium","thinking":"off","variables":%s}
                """.formatted(promptText, variablesJson);
        String response = mockMvc.perform(post("/api/prompts")
                        .header(HttpHeaders.AUTHORIZATION, token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isCreated())
                .andReturn()
                .getResponse()
                .getContentAsString();
        return JsonPath.read(response, "$.promptId");
    }

    private void setApiKey(String token) throws Exception {
        mockMvc.perform(put("/api/me/api-key")
                        .header(HttpHeaders.AUTHORIZATION, token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"apiKey\":\"sk-ant-test\"}"))
                .andExpect(status().isNoContent());
    }

    private org.springframework.test.web.servlet.ResultActions run(String token, String promptId, String valuesJson)
            throws Exception {
        return mockMvc.perform(post("/api/prompts/" + promptId + "/versions/1/runs")
                .header(HttpHeaders.AUTHORIZATION, token)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"values\":" + valuesJson + "}"));
    }

    @Test
    void runWithoutSavedKeyReturnsNoApiKey() throws Exception {
        String token = "Bearer " + TestTokens.registerAndLogin(mockMvc, "nokey-run@example.com", "password123");
        String promptId = createPrompt(token, "Say hi", "[]");

        run(token, promptId, "{}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("no_api_key"));
    }

    @Test
    void crossUserRunReturns404() throws Exception {
        String ownerToken = "Bearer " + TestTokens.registerAndLogin(mockMvc, "run-owner@example.com", "password123");
        String promptId = createPrompt(ownerToken, "Say hi", "[]");
        String otherToken = "Bearer " + TestTokens.registerAndLogin(mockMvc, "run-intruder@example.com", "password123");
        setApiKey(otherToken);

        run(otherToken, promptId, "{}")
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("not_found"));
    }

    @Test
    void missingRequiredVariableRejected() throws Exception {
        String token = "Bearer " + TestTokens.registerAndLogin(mockMvc, "run-missing@example.com", "password123");
        setApiKey(token);
        String promptId = createPrompt(token, "Hi {{name}}", "[{\"name\":\"name\",\"required\":true}]");

        run(token, promptId, "{}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("validation_error"));
    }
}
