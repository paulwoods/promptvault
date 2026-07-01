package com.promptvault.run;

import com.promptvault.apikey.ApiKeyService;
import com.promptvault.claude.ClaudeRequest;
import com.promptvault.prompt.PromptService;
import com.promptvault.prompt.Version;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * Orchestrates a one-shot streamed Run. Phase-5 prep runs first (no-key guard,
 * then owner-scoped Version resolution, then Variable validation); a failure
 * there throws before any Run row exists. Then the in-progress row is created
 * and streaming (off the request thread, emitting a leading meta frame followed
 * by token frames) is delegated to {@link RunStreamer}.
 */
@Service
public class RunService {

    private final ApiKeyService apiKeyService;
    private final PromptService promptService;
    private final RunPreparer runPreparer;
    private final RunStore runStore;
    private final RunStreamer runStreamer;

    public RunService(
            ApiKeyService apiKeyService,
            PromptService promptService,
            RunPreparer runPreparer,
            RunStore runStore,
            RunStreamer runStreamer) {
        this.apiKeyService = apiKeyService;
        this.promptService = promptService;
        this.runPreparer = runPreparer;
        this.runStore = runStore;
        this.runStreamer = runStreamer;
    }

    public SseEmitter run(UUID userId, UUID promptId, int versionNumber, Map<String, String> values) {
        // No-key guard first: throws (no_api_key) before any Run row or Variable validation.
        String apiKey = apiKeyService.getDecryptedKey(userId);
        Version version = promptService.getVersion(userId, promptId, versionNumber);
        ClaudeRequest request = runPreparer.prepare(version, values);
        Run run = runStore.createInProgress(userId, version.getId(), values, request.userMessage(), version.getModel());
        return runStreamer.streamAsync(run, version.getNumber(), request, apiKey);
    }
}
