package com.promptvault.run;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.promptvault.AbstractDatabaseTest;
import com.promptvault.apikey.ApiKeyService;
import com.promptvault.claude.FakeClaudeClient;
import com.promptvault.claude.Usage;
import com.promptvault.error.DomainValidationException;
import com.promptvault.prompt.Prompt;
import com.promptvault.prompt.PromptRequest;
import com.promptvault.prompt.PromptService;
import com.promptvault.usage.ModelUsage;
import com.promptvault.usage.TokenUsageRecorder;
import com.promptvault.usage.UsageQueryService;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.ObjectMapper;

/**
 * Exercises the real, fully-wired {@link RunService#run} end to end — guard,
 * owner-scoped resolution, streaming, and token accounting together — the one
 * path no other test reaches (RunEndpointTest stops before streaming starts;
 * RunStreamerTest calls RunStreamer directly, bypassing RunService). Only the
 * Claude client is faked; everything else is the real, DB-backed bean.
 *
 * <p>Since ADR-0007 the run itself leaves no row, so the observable end state is
 * the User's token totals. Not transactional: the streaming half genuinely runs
 * on its own virtual thread with its own connection, so a per-test rollback on
 * the calling thread (as {@code IntegrationTest} provides) would hide that
 * thread's writes. Truncates instead.
 */
class RunServiceTest extends AbstractDatabaseTest {

    @Autowired
    private ApiKeyService apiKeyService;

    @Autowired
    private PromptService promptService;

    @Autowired
    private TokenUsageRecorder tokenUsageRecorder;

    @Autowired
    private UsageQueryService usageQueryService;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @AfterEach
    void cleanup() {
        jdbcTemplate.execute("truncate table token_usage, prompt, api_key, users cascade");
    }

    @Test
    void happyPathRunsEndToEndAndRecordsTokenUsage() throws InterruptedException {
        UUID userId = UUID.randomUUID();
        jdbcTemplate.update(
                "insert into users (id, email, password_hash, name) values (?, ?, ?, ?)",
                userId,
                "runservice-" + userId + "@example.com",
                "hash",
                "Run Service Test");
        apiKeyService.save(userId, "sk-ant-test-key");

        PromptRequest request = new PromptRequest(
                "P",
                null,
                "Say hi to {{name}}",
                "claude-opus-4-8",
                null,
                1000,
                "medium",
                "off");
        Prompt prompt = promptService.createPrompt(userId, request);

        FakeClaudeClient fake = new FakeClaudeClient();
        fake.respondWith(List.of("Hello", " there"), new Usage(4, 6));
        RunStreamer streamer = new RunStreamer(fake, tokenUsageRecorder, objectMapper);
        RunService runService = new RunService(apiKeyService, promptService, streamer);

        runService.run(userId, prompt.getId());

        ModelUsage usage = awaitUsage(userId);
        assertThat(usage.model()).isEqualTo("claude-opus-4-8");
        assertThat(usage.inputTokens()).isEqualTo(4);
        assertThat(usage.outputTokens()).isEqualTo(6);
        // The seam received the prompt text verbatim (ADR-0009): {{name}} is ordinary text now.
        assertThat(fake.capturedRequest().userMessage()).isEqualTo("Say hi to {{name}}");
    }

    /** Both bodies blank is saveable but not runnable (ADR-0013): the run 400s before anything streams. */
    @Test
    void aPromptWithNeitherBodyFilledIsNotRunnable() throws InterruptedException {
        UUID userId = UUID.randomUUID();
        jdbcTemplate.update(
                "insert into users (id, email, password_hash, name) values (?, ?, ?, ?)",
                userId,
                "runservice-empty-" + userId + "@example.com",
                "hash",
                "Run Service Test");
        apiKeyService.save(userId, "sk-ant-test-key");

        Prompt prompt = promptService.createPrompt(
                userId,
                new PromptRequest(
                        "Empty", null, "", "claude-opus-4-8", null, 1000, "medium", "off"));
        assertThat(prompt.getPromptText()).isNull();

        RunStreamer streamer = new RunStreamer(new FakeClaudeClient(), tokenUsageRecorder, objectMapper);
        RunService runService = new RunService(apiKeyService, promptService, streamer);

        assertThatThrownBy(() -> runService.run(userId, prompt.getId()))
                .isInstanceOf(DomainValidationException.class);

        // A single filled body is enough — this run reaches the fake client.
        promptService.updatePrompt(
                userId,
                prompt.getId(),
                new PromptRequest(
                        "Empty", null, "", "claude-opus-4-8", "Be brief", 1000, "medium", "off"));
        runService.run(userId, prompt.getId());

        // Outlives the assertion on purpose: the usage row landing is also what
        // keeps the cleanup from racing the streaming thread's write.
        awaitUsage(userId);
    }

    /** Polls because the streaming half settles on its own virtual thread. */
    private ModelUsage awaitUsage(UUID userId) throws InterruptedException {
        Instant deadline = Instant.now().plus(Duration.ofSeconds(5));
        while (Instant.now().isBefore(deadline)) {
            List<ModelUsage> usage = usageQueryService.usage(userId);
            if (!usage.isEmpty()) {
                return usage.getFirst();
            }
            Thread.sleep(50);
        }
        throw new AssertionError("Token usage was not recorded within 5s");
    }
}