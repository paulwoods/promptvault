package com.promptvault.prompt;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
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
import org.springframework.test.web.servlet.ResultActions;

class PromptPatchTest extends IntegrationTest {

    private static final String FULL_BODY =
            """
            {
              "name": "Original",
              "description": "Original desc",
              "promptText": "Hello {{who}}",
              "model": "claude-opus-4-8",
              "systemPrompt": "Be brief",
              "maxTokens": 1000,
              "effort": "medium",
              "thinking": "off"
            }
            """;

    @Autowired
    private MockMvc mockMvc;

    private String createPrompt(String token) throws Exception {
        String response = mockMvc.perform(post("/api/prompts")
                        .header(HttpHeaders.AUTHORIZATION, token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(FULL_BODY))
                .andExpect(status().isCreated())
                .andReturn()
                .getResponse()
                .getContentAsString();
        return JsonPath.read(response, "$.promptId");
    }

    private ResultActions patchPrompt(String token, String promptId, String body) throws Exception {
        return mockMvc.perform(patch("/api/prompts/" + promptId)
                .header(HttpHeaders.AUTHORIZATION, token)
                .contentType(MediaType.APPLICATION_JSON)
                .content(body));
    }

    /** PATCH is the Prompt's only mutating door; the full-save PUT is retired (ADR-0014). */
    @Test
    void putIsNotAWriteDoor() throws Exception {
        String token = "Bearer " + TestTokens.registerAndLogin(mockMvc, "no-put@example.com", "password123");
        String promptId = createPrompt(token);

        mockMvc.perform(put("/api/prompts/" + promptId)
                        .header(HttpHeaders.AUTHORIZATION, token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(FULL_BODY))
                .andExpect(status().isMethodNotAllowed());
    }

    @Test
    void patchChangesOnlyTheSuppliedFields() throws Exception {
        String token = "Bearer " + TestTokens.registerAndLogin(mockMvc, "patcher@example.com", "password123");
        String promptId = createPrompt(token);

        patchPrompt(token, promptId, "{\"name\": \"Renamed\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Renamed"));

        mockMvc.perform(get("/api/prompts/" + promptId).header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Renamed"))
                .andExpect(jsonPath("$.description").value("Original desc"))
                .andExpect(jsonPath("$.promptText").value("Hello {{who}}"))
                .andExpect(jsonPath("$.model").value("claude-opus-4-8"))
                .andExpect(jsonPath("$.systemPrompt").value("Be brief"))
                .andExpect(jsonPath("$.maxTokens").value(1000))
                .andExpect(jsonPath("$.effort").value("medium"))
                .andExpect(jsonPath("$.thinking").value("off"));
    }

    /** An empty patch is legal and leaves the content as it was. */
    @Test
    void anEmptyPatchIsANoOp() throws Exception {
        String token = "Bearer " + TestTokens.registerAndLogin(mockMvc, "empty-patch@example.com", "password123");
        String promptId = createPrompt(token);

        patchPrompt(token, promptId, "{}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Original"))
                .andExpect(jsonPath("$.promptText").value("Hello {{who}}"));
    }

    /** Same convention as a full save: blank clears an optional field — both prompt bodies included (ADR-0013). */
    @Test
    void aBlankOptionalFieldClearsIt() throws Exception {
        String token = "Bearer " + TestTokens.registerAndLogin(mockMvc, "clearer@example.com", "password123");
        String promptId = createPrompt(token);

        patchPrompt(token, promptId, "{\"description\": \"\", \"promptText\": \"  \", \"systemPrompt\": \"\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.description").value(nullValue()))
                .andExpect(jsonPath("$.promptText").value(nullValue()))
                .andExpect(jsonPath("$.systemPrompt").value(nullValue()))
                .andExpect(jsonPath("$.name").value("Original"));
    }

    /** Run Settings are validated against the merged content, not the patch alone. */
    @Test
    void patchingOneRunSettingIsValidatedAgainstTheStoredRest() throws Exception {
        String token = "Bearer " + TestTokens.registerAndLogin(mockMvc, "settings@example.com", "password123");
        String promptId = createPrompt(token);

        patchPrompt(token, promptId, "{\"model\": \"not-a-model\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("validation_error"))
                .andExpect(jsonPath("$.details.model").exists());

        patchPrompt(token, promptId, "{\"effort\": \"extreme\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.effort").exists());
    }

    /**
     * Bean Validation still applies to the merged content, so a patch cannot
     * blank a required field. The prompt text is not one since ADR-0013 — the
     * required survivors are name and the Run Settings.
     */
    @Test
    void patchCannotBlankARequiredField() throws Exception {
        String token = "Bearer " + TestTokens.registerAndLogin(mockMvc, "blanker@example.com", "password123");
        String promptId = createPrompt(token);

        patchPrompt(token, promptId, "{\"name\": \"   \"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("validation_error"))
                .andExpect(jsonPath("$.details.name").exists());

        patchPrompt(token, promptId, "{\"maxTokens\": 0}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.maxTokens").exists());
    }

    @Test
    void crossUserPatchReturns404AndChangesNothing() throws Exception {
        String ownerToken = "Bearer " + TestTokens.registerAndLogin(mockMvc, "owner-p@example.com", "password123");
        String promptId = createPrompt(ownerToken);
        String otherToken = "Bearer " + TestTokens.registerAndLogin(mockMvc, "intruder-p@example.com", "password123");

        patchPrompt(otherToken, promptId, "{\"name\": \"Hijacked\"}").andExpect(status().isNotFound());

        mockMvc.perform(get("/api/prompts/" + promptId).header(HttpHeaders.AUTHORIZATION, ownerToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Original"));
    }

    /**
     * One validation pass, one envelope: create and patch reaching the same bad
     * value answer with byte-identical bodies (ADR-0014).
     */
    @Test
    void createAndPatchReportTheSameBadValueIdentically() throws Exception {
        String token = "Bearer " + TestTokens.registerAndLogin(mockMvc, "one-envelope@example.com", "password123");
        String promptId = createPrompt(token);

        String fromCreate = mockMvc.perform(post("/api/prompts")
                        .header(HttpHeaders.AUTHORIZATION, token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(FULL_BODY.replace("\"maxTokens\": 1000", "\"maxTokens\": 999999")))
                .andExpect(status().isBadRequest())
                .andReturn()
                .getResponse()
                .getContentAsString();
        String fromPatch = patchPrompt(token, promptId, "{\"maxTokens\": 999999}")
                .andExpect(status().isBadRequest())
                .andReturn()
                .getResponse()
                .getContentAsString();

        assertThat(fromCreate).isEqualTo(fromPatch);
    }

    /** The mechanical pass collects: break two fields and both are named. */
    @Test
    void everyMechanicalViolationIsReported() throws Exception {
        String token = "Bearer " + TestTokens.registerAndLogin(mockMvc, "two-bad@example.com", "password123");
        String promptId = createPrompt(token);

        patchPrompt(token, promptId, "{\"name\": \"   \", \"maxTokens\": 999999}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("validation_error"))
                .andExpect(jsonPath("$.details.name").exists())
                .andExpect(jsonPath("$.details.maxTokens").exists());
    }

    /**
     * The domain chain stays fail-fast: an unsupported model is one fact, and
     * reporting the effort that could not be judged against it would state it
     * twice.
     */
    @Test
    void aBadModelIsReportedOnce() throws Exception {
        String token = "Bearer " + TestTokens.registerAndLogin(mockMvc, "one-domain@example.com", "password123");
        String promptId = createPrompt(token);

        patchPrompt(token, promptId, "{\"model\": \"not-a-model\", \"effort\": \"nonsense\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.details.length()").value(1))
                .andExpect(jsonPath("$.details.model").exists());
    }

    /** Trashed prompts are invisible to editing (ADR-0004), patch included. */
    @Test
    void patchingATrashedPromptReturns404() throws Exception {
        String token = "Bearer " + TestTokens.registerAndLogin(mockMvc, "trash-patch@example.com", "password123");
        String promptId = createPrompt(token);

        mockMvc.perform(delete("/api/prompts/" + promptId).header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isNoContent());

        patchPrompt(token, promptId, "{\"name\": \"Renamed\"}").andExpect(status().isNotFound());
    }
}
