package com.promptvault.run;

import static org.assertj.core.api.Assertions.assertThat;

import com.promptvault.AbstractDatabaseTest;
import com.promptvault.apikey.ApiKeyService;
import com.promptvault.claude.FakeClaudeClient;
import com.promptvault.claude.Usage;
import com.promptvault.prompt.PromptService;
import com.promptvault.prompt.VariableDeclaration;
import com.promptvault.prompt.Version;
import com.promptvault.prompt.VersionRequest;
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
 * owner-scoped resolution, preparation, persistence, and streaming together —
 * the one path no other test reaches (RunEndpointTest stops before streaming
 * starts; RunStreamerTest calls RunStreamer directly, bypassing RunService).
 * Only the Claude client is faked; everything else is the real, DB-backed bean.
 *
 * <p>Not transactional: the streaming half genuinely runs on its own virtual
 * thread with its own connection, so a per-test rollback on the calling thread
 * (as {@code IntegrationTest} provides) would hide the just-created Run row from
 * that thread and the finalize step would never find it. Truncates instead.
 */
class RunServiceTest extends AbstractDatabaseTest {

    @Autowired
    private ApiKeyService apiKeyService;

    @Autowired
    private PromptService promptService;

    @Autowired
    private RunPreparer runPreparer;

    @Autowired
    private RunStore runStore;

    @Autowired
    private RunRepository runRepository;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @AfterEach
    void cleanup() {
        jdbcTemplate.execute("truncate table run, version, prompt, api_key, users cascade");
    }

    @Test
    void happyPathRunsEndToEndAndPersistsCompleted() throws InterruptedException {
        UUID userId = UUID.randomUUID();
        jdbcTemplate.update(
                "insert into users (id, email, password_hash, name) values (?, ?, ?, ?)",
                userId,
                "runservice-" + userId + "@example.com",
                "hash",
                "Run Service Test");
        apiKeyService.save(userId, "sk-ant-test-key");

        VersionRequest versionRequest = new VersionRequest(
                "P",
                null,
                "Say hi to {{name}}",
                "claude-opus-4-8",
                null,
                1000,
                "medium",
                "off",
                List.of(new VariableDeclaration("name", null, true, null)));
        Version version = promptService.createPrompt(userId, versionRequest);

        FakeClaudeClient fake = new FakeClaudeClient();
        fake.respondWith(List.of("Hello", " there"), new Usage(4, 6));
        RunStreamer streamer = new RunStreamer(fake, runStore, objectMapper);
        RunService runService = new RunService(apiKeyService, promptService, runPreparer, runStore, streamer);

        runService.run(userId, version.getPromptId(), version.getNumber(), Map.of("name", "Ada"));

        Run run = awaitTerminalRun(userId, version.getId());
        assertThat(run.getStatus()).isEqualTo(Run.COMPLETED);
        assertThat(run.getResponse()).isEqualTo("Hello there");
        assertThat(run.getInputTokens()).isEqualTo(4);
        assertThat(run.getOutputTokens()).isEqualTo(6);
        assertThat(run.getRenderedPrompt()).isEqualTo("Say hi to Ada");
    }

    /**
     * Polls rather than using SseEmitter#onCompletion: that callback is only
     * ever invoked by Spring MVC's async request machinery, which doesn't exist
     * here since this test calls RunService directly instead of going through
     * an HTTP request.
     */
    private Run awaitTerminalRun(UUID userId, UUID versionId) throws InterruptedException {
        Instant deadline = Instant.now().plus(Duration.ofSeconds(5));
        while (Instant.now().isBefore(deadline)) {
            List<Run> runs = runRepository.findByUserIdAndVersionIdOrderByCreatedAtDesc(userId, versionId);
            if (!runs.isEmpty() && !Run.IN_PROGRESS.equals(runs.getFirst().getStatus())) {
                return runs.getFirst();
            }
            Thread.sleep(50);
        }
        throw new AssertionError("Run did not reach a terminal status within 5s");
    }
}
