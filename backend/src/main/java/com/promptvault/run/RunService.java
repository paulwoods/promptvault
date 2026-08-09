package com.promptvault.run;

import com.promptvault.apikey.ApiKeyService;
import com.promptvault.claude.ClaudeRequest;
import com.promptvault.prompt.Prompt;
import com.promptvault.prompt.PromptService;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * Orchestrates a one-shot streamed run. Prep runs first (no-key guard, then
 * owner-scoped Prompt resolution, then Variable validation); a failure there
 * throws before anything is streamed. Nothing about the run is persisted
 * (ADR-0007) — only its token count, once it completes.
 */
@Service
public class RunService {

    private final ApiKeyService apiKeyService;
    private final PromptService promptService;
    private final RunPreparer runPreparer;
    private final RunStreamer runStreamer;

    public RunService(
            ApiKeyService apiKeyService,
            PromptService promptService,
            RunPreparer runPreparer,
            RunStreamer runStreamer) {
        this.apiKeyService = apiKeyService;
        this.promptService = promptService;
        this.runPreparer = runPreparer;
        this.runStreamer = runStreamer;
    }

    public SseEmitter run(UUID userId, UUID promptId, Map<String, String> values) {
        // No-key guard first: throws (no_api_key) before Variable validation.
        String apiKey = apiKeyService.getDecryptedKey(userId);
        Prompt prompt = promptService.getPrompt(userId, promptId);
        ClaudeRequest request = runPreparer.prepare(prompt, values);
        return runStreamer.streamAsync(userId, prompt.getModel(), request, apiKey);
    }
}
