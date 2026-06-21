package com.promptvault.run;

import com.promptvault.apikey.ApiKeyService;
import com.promptvault.claude.ClaudeRequest;
import com.promptvault.prompt.PromptService;
import com.promptvault.prompt.Version;
import java.time.Duration;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import tools.jackson.databind.ObjectMapper;

/**
 * Orchestrates a one-shot streamed Run. Phase-5 prep runs first (no-key guard,
 * then owner-scoped Version resolution, then Variable validation); a failure
 * there throws before any Run row exists. Then the in-progress row is created
 * and the streaming work is run off the request thread, emitting a leading meta
 * frame followed by token frames.
 */
@Service
public class RunService {

    private static final long STREAM_TIMEOUT_MS = Duration.ofMinutes(10).toMillis();

    private final ApiKeyService apiKeyService;
    private final PromptService promptService;
    private final RunPreparer runPreparer;
    private final RunStore runStore;
    private final RunStreamer runStreamer;
    private final StreamingExecutor streamingExecutor;
    private final ObjectMapper objectMapper;

    public RunService(
            ApiKeyService apiKeyService,
            PromptService promptService,
            RunPreparer runPreparer,
            RunStore runStore,
            RunStreamer runStreamer,
            StreamingExecutor streamingExecutor,
            ObjectMapper objectMapper) {
        this.apiKeyService = apiKeyService;
        this.promptService = promptService;
        this.runPreparer = runPreparer;
        this.runStore = runStore;
        this.runStreamer = runStreamer;
        this.streamingExecutor = streamingExecutor;
        this.objectMapper = objectMapper;
    }

    public SseEmitter run(UUID userId, UUID promptId, int versionNumber, Map<String, String> values) {
        // No-key guard first: throws (no_api_key) before any Run row or Variable validation.
        String apiKey = apiKeyService.getDecryptedKey(userId);
        Version version = promptService.getVersion(userId, promptId, versionNumber);
        ClaudeRequest request = runPreparer.prepare(version, values);
        Run run = runStore.createInProgress(userId, version.getId(), values, request.userMessage(), version.getModel());

        SseEmitter emitter = new SseEmitter(STREAM_TIMEOUT_MS);
        SseRunStream out = new SseRunStream(emitter, objectMapper);
        streamingExecutor.execute(() -> runStreamer.stream(out, run, version.getNumber(), request, apiKey));
        return emitter;
    }
}
