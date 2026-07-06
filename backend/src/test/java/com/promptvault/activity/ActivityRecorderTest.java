package com.promptvault.activity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import com.promptvault.IntegrationTest;
import com.promptvault.support.TestTokens;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

/**
 * ADR-0006: each of the nine mutations (plus login) writes exactly one
 * activity_event row, same-transaction, with a non-blank label; a mutation
 * that fails its own validation writes none.
 */
class ActivityRecorderTest extends IntegrationTest {

    private static final String PROMPT_BODY = """
            {"name":"P1","promptText":"Hello","model":"claude-opus-4-8","maxTokens":1000,"effort":"medium","thinking":"off"}
            """;

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @PersistenceContext
    private EntityManager entityManager;

    private UUID userIdOf(String email) {
        entityManager.flush();
        return jdbcTemplate.queryForObject("select id from users where email = ?", UUID.class, email);
    }

    private long countEvents(UUID userId, String type) {
        entityManager.flush();
        return jdbcTemplate.queryForObject(
                "select count(*) from activity_event where user_id = ? and type = ?", Long.class, userId, type);
    }

    private String labelOf(UUID userId, String type) {
        entityManager.flush();
        return jdbcTemplate.queryForObject(
                "select label from activity_event where user_id = ? and type = ?", String.class, userId, type);
    }

    private String createPrompt(String token, String body) throws Exception {
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

    @Test
    void registerWritesExactlyOneRegisteredEvent() throws Exception {
        String email = "act-register@example.com";
        TestTokens.registerAndLogin(mockMvc, email, "password123");
        UUID userId = userIdOf(email);

        assertThat(countEvents(userId, ActivityEvent.REGISTERED)).isEqualTo(1);
        assertThat(labelOf(userId, ActivityEvent.REGISTERED)).isNotBlank();
    }

    @Test
    void duplicateRegistrationWritesNoSecondRegisteredEvent() throws Exception {
        String email = "act-dup@example.com";
        TestTokens.registerAndLogin(mockMvc, email, "password123");
        UUID userId = userIdOf(email);

        mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"%s\",\"password\":\"password123\"}".formatted(email)))
                .andExpect(status().isConflict());

        assertThat(countEvents(userId, ActivityEvent.REGISTERED)).isEqualTo(1);
    }

    @Test
    void loginWritesExactlyOneLoggedInEvent() throws Exception {
        String email = "act-login@example.com";
        TestTokens.registerAndLogin(mockMvc, email, "password123");
        UUID userId = userIdOf(email);

        assertThat(countEvents(userId, ActivityEvent.LOGGED_IN)).isEqualTo(1);
        assertThat(labelOf(userId, ActivityEvent.LOGGED_IN)).isNotBlank();
    }

    @Test
    void wrongPasswordLoginWritesNoLoggedInEvent() throws Exception {
        String email = "act-badlogin@example.com";
        TestTokens.registerAndLogin(mockMvc, email, "password123");
        UUID userId = userIdOf(email);

        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"%s\",\"password\":\"wrong\"}".formatted(email)))
                .andExpect(status().isUnauthorized());

        assertThat(countEvents(userId, ActivityEvent.LOGGED_IN)).isEqualTo(1);
    }

    @Test
    void nameChangeWritesEventWithTheNewTrimmedName() throws Exception {
        String email = "act-name@example.com";
        String token = "Bearer " + TestTokens.registerAndLogin(mockMvc, email, "password123");
        UUID userId = userIdOf(email);

        mockMvc.perform(put("/api/me/name")
                        .header(HttpHeaders.AUTHORIZATION, token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"  Ada Lovelace  \"}"))
                .andExpect(status().isNoContent());

        assertThat(countEvents(userId, ActivityEvent.NAME_CHANGED)).isEqualTo(1);
        assertThat(labelOf(userId, ActivityEvent.NAME_CHANGED)).isEqualTo("Ada Lovelace");
    }

    @Test
    void apiKeySaveWritesAnEventOnBothCreateAndReplace() throws Exception {
        String email = "act-apikey@example.com";
        String token = "Bearer " + TestTokens.registerAndLogin(mockMvc, email, "password123");
        UUID userId = userIdOf(email);

        mockMvc.perform(put("/api/me/api-key")
                        .header(HttpHeaders.AUTHORIZATION, token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"apiKey\":\"sk-ant-first\"}"))
                .andExpect(status().isNoContent());
        assertThat(countEvents(userId, ActivityEvent.API_KEY_SET)).isEqualTo(1);

        mockMvc.perform(put("/api/me/api-key")
                        .header(HttpHeaders.AUTHORIZATION, token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"apiKey\":\"sk-ant-second\"}"))
                .andExpect(status().isNoContent());
        assertThat(countEvents(userId, ActivityEvent.API_KEY_SET)).isEqualTo(2);
    }

    @Test
    void createPromptWritesAPromptCreatedEventLabeledWithTheVersionName() throws Exception {
        String email = "act-create@example.com";
        String token = "Bearer " + TestTokens.registerAndLogin(mockMvc, email, "password123");
        UUID userId = userIdOf(email);

        createPrompt(token, PROMPT_BODY);

        assertThat(countEvents(userId, ActivityEvent.PROMPT_CREATED)).isEqualTo(1);
        assertThat(labelOf(userId, ActivityEvent.PROMPT_CREATED)).isEqualTo("P1");
    }

    @Test
    void rejectedPlaceholderMismatchWritesNoPromptCreatedEvent() throws Exception {
        String email = "act-badcreate@example.com";
        String token = "Bearer " + TestTokens.registerAndLogin(mockMvc, email, "password123");
        UUID userId = userIdOf(email);

        mockMvc.perform(post("/api/prompts")
                        .header(HttpHeaders.AUTHORIZATION, token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"Bad","promptText":"Tell me about {{topic}}","model":"claude-opus-4-8",
                                 "maxTokens":1000,"effort":"medium","thinking":"off","variables":[]}
                                """))
                .andExpect(status().isBadRequest());

        assertThat(countEvents(userId, ActivityEvent.PROMPT_CREATED)).isEqualTo(0);
    }

    @Test
    void addVersionWritesAVersionSavedEventLabeledWithTheNewVersionName() throws Exception {
        String email = "act-addversion@example.com";
        String token = "Bearer " + TestTokens.registerAndLogin(mockMvc, email, "password123");
        UUID userId = userIdOf(email);
        String promptId = createPrompt(token, PROMPT_BODY);

        mockMvc.perform(post("/api/prompts/" + promptId + "/versions")
                        .header(HttpHeaders.AUTHORIZATION, token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"P1 v2","promptText":"Hello again","model":"claude-opus-4-8",
                                 "maxTokens":1000,"effort":"medium","thinking":"off"}
                                """))
                .andExpect(status().isCreated());

        assertThat(countEvents(userId, ActivityEvent.VERSION_SAVED)).isEqualTo(1);
        assertThat(labelOf(userId, ActivityEvent.VERSION_SAVED)).isEqualTo("P1 v2");
        // Only the second save is version_saved; the first stays prompt_created.
        assertThat(countEvents(userId, ActivityEvent.PROMPT_CREATED)).isEqualTo(1);
    }

    @Test
    void deletePromptWritesAPromptDeletedEventLabeledWithTheCurrentVersionName() throws Exception {
        String email = "act-delete@example.com";
        String token = "Bearer " + TestTokens.registerAndLogin(mockMvc, email, "password123");
        UUID userId = userIdOf(email);
        String promptId = createPrompt(token, PROMPT_BODY);

        mockMvc.perform(delete("/api/prompts/" + promptId).header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isNoContent());

        assertThat(countEvents(userId, ActivityEvent.PROMPT_DELETED)).isEqualTo(1);
        assertThat(labelOf(userId, ActivityEvent.PROMPT_DELETED)).isEqualTo("P1");
    }

    @Test
    void restorePromptWritesAPromptRestoredEvent() throws Exception {
        String email = "act-restore@example.com";
        String token = "Bearer " + TestTokens.registerAndLogin(mockMvc, email, "password123");
        UUID userId = userIdOf(email);
        String promptId = createPrompt(token, PROMPT_BODY);
        mockMvc.perform(delete("/api/prompts/" + promptId).header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isNoContent());

        mockMvc.perform(post("/api/prompts/" + promptId + "/restore").header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isNoContent());

        assertThat(countEvents(userId, ActivityEvent.PROMPT_RESTORED)).isEqualTo(1);
        assertThat(labelOf(userId, ActivityEvent.PROMPT_RESTORED)).isEqualTo("P1");
    }

    @Test
    void runStartWritesARunStartedEventLabeledWithTheVersionNameAndCarryingTheRunId() throws Exception {
        String email = "act-run@example.com";
        String token = "Bearer " + TestTokens.registerAndLogin(mockMvc, email, "password123");
        UUID userId = userIdOf(email);
        mockMvc.perform(put("/api/me/api-key")
                        .header(HttpHeaders.AUTHORIZATION, token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"apiKey\":\"sk-ant-test\"}"))
                .andExpect(status().isNoContent());
        String promptId = createPrompt(token, PROMPT_BODY);

        mockMvc.perform(post("/api/prompts/" + promptId + "/versions/1/runs")
                .header(HttpHeaders.AUTHORIZATION, token)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"values\":{}}"));

        assertThat(countEvents(userId, ActivityEvent.RUN_STARTED)).isEqualTo(1);
        assertThat(labelOf(userId, ActivityEvent.RUN_STARTED)).isEqualTo("P1");
        entityManager.flush();
        UUID runId = jdbcTemplate.queryForObject("select id from run where user_id = ?", UUID.class, userId);
        UUID eventRunId = jdbcTemplate.queryForObject(
                "select run_id from activity_event where user_id = ? and type = ?",
                UUID.class,
                userId,
                ActivityEvent.RUN_STARTED);
        assertThat(eventRunId).isEqualTo(runId);
    }
}
