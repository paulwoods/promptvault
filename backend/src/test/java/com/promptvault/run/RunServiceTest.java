package com.promptvault.run;

import static org.assertj.core.api.Assertions.assertThat;

import com.promptvault.AbstractDatabaseTest;
import com.promptvault.apikey.ApiKeyService;
import com.promptvault.claude.FakeClaudeClient;
import com.promptvault.claude.Usage;
import com.promptvault.prompt.Prompt;
import com.promptvault.prompt.PromptRequest;
import com.promptvault.prompt.PromptService;
import com.promptvault.prompt.VariableDeclaration;
import com.promptvault.usage.ModelUsage;
import com.promptvault.usage.TokenUsageRecorder;
import com.promptvault.usage.UsageQueryService;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.ObjectMapper;

/**
 * Exercises the real, fully-wired {@link RunService#run} end to end — guard,
 * owner-scoped resolution, preparation, streaming, and token accounting
 * together — the one path no other test reaches (RunEndpointTest stops before
 * streaming starts; RunStreamerTest calls RunStreamer directly, bypassing
 * RunService). Only the Claude client is faked; everything else is the real,
 * DB-backed bean.
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
    private RunPreparer runPreparer;

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
                "off",
                List.of(new VariableDeclaration("name", null, true, null)));
        Prompt prompt = promptService.createPrompt(userId, request);

        FakeClaudeClient fake = new FakeClaudeClient();
        fake.respondWith(List.of("Hello", " there"), new Usage(4, 6));
        RunStreamer streamer = new RunStreamer(fake, tokenUsageRecorder, objectMapper);
        RunService runService = new RunService(apiKeyService, promptService, runPreparer, streamer);

        runService.run(userId, prompt.getId(), Map.of("name", "Ada"));

        ModelUsage usage = awaitUsage(userId);
        assertThat(usage.model()).isEqualTo("claude-opus-4-8");
        assertThat(usage.inputTokens()).isEqualTo(4);
        assertThat(usage.outputTokens()).isEqualTo(6);
        // The seam received the substituted prompt, proving preparation ran in this path.
        assertThat(fake.capturedRequest().userMessage()).isEqualTo("Say hi to Ada");
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
