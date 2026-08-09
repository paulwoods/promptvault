package com.promptvault.run;

import com.promptvault.apikey.ApiKeyService;
import com.promptvault.claude.ClaudeRequest;
import com.promptvault.prompt.Prompt;
import com.promptvault.prompt.PromptService;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * Orchestrates a one-shot streamed run. The no-key guard and owner-scoped
 * Prompt resolution both throw before anything is streamed. Nothing about the
 * run is persisted (ADR-0007) — only its token count, once it completes. The
 * prompt text is sent to Claude verbatim (ADR-0009): there is no Variable
 * substitution.
 */
@Service
public class RunService {

    private final ApiKeyService apiKeyService;
    private final PromptService promptService;
    private final RunStreamer runStreamer;

    public RunService(
            ApiKeyService apiKeyService,
            PromptService promptService,
            RunStreamer runStreamer) {
        this.apiKeyService = apiKeyService;
        this.promptService = promptService;
        this.runStreamer = runStreamer;
    }

    public SseEmitter run(UUID userId, UUID promptId) {
        // No-key guard first: throws (no_api_key) before the Prompt is touched.
        String apiKey = apiKeyService.getDecryptedKey(userId);
        Prompt prompt = promptService.getPrompt(userId, promptId);
        ClaudeRequest request = new ClaudeRequest(
                prompt.getModel(),
                prompt.getSystemPrompt(),
                prompt.getPromptText(),
                prompt.getMaxTokens(),
                prompt.getEffort(),
                prompt.getThinking());
        return runStreamer.streamAsync(userId, prompt.getModel(), request, apiKey);
    }
}