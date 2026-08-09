package com.promptvault.run;

import com.promptvault.claude.ClaudeClient;
import com.promptvault.claude.ClaudeException;
import com.promptvault.claude.ClaudeRequest;
import com.promptvault.claude.TokenSink;
import com.promptvault.claude.Usage;
import com.promptvault.usage.TokenUsageRecorder;
import java.time.Duration;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import tools.jackson.databind.ObjectMapper;

/**
 * Drives the Claude seam and writes frames to a {@link RunStream}: a token frame
 * per delta, then done or error. Nothing about the run is persisted (ADR-0007);
 * a completed run's token counts are reported to {@link TokenUsageRecorder} and
 * that is the only trace it leaves. A failed or disconnected run leaves nothing
 * at all, so there is no partial state to reconcile and no orphan to reap.
 */
@Component
public class RunStreamer {

    private static final Logger log = LoggerFactory.getLogger(RunStreamer.class);

    private static final long STREAM_TIMEOUT_MS = Duration.ofMinutes(10).toMillis();

    private final ClaudeClient claudeClient;
    private final TokenUsageRecorder tokenUsageRecorder;
    private final ObjectMapper objectMapper;

    public RunStreamer(
            ClaudeClient claudeClient, TokenUsageRecorder tokenUsageRecorder, ObjectMapper objectMapper) {
        this.claudeClient = claudeClient;
        this.tokenUsageRecorder = tokenUsageRecorder;
        this.objectMapper = objectMapper;
    }

    /**
     * Builds the SSE channel for a run and drives it on its own virtual thread,
     * returning the emitter immediately so the request thread isn't held for the
     * duration of the generation.
     */
    public SseEmitter streamAsync(UUID userId, String model, ClaudeRequest request, String apiKey) {
        SseEmitter emitter = new SseEmitter(STREAM_TIMEOUT_MS);
        SseRunStream out = new SseRunStream(emitter, objectMapper);
        Thread.ofVirtual().name("run-stream-", 0).start(() -> stream(out, userId, model, request, apiKey));
        return emitter;
    }

    public void stream(RunStream out, UUID userId, String model, ClaudeRequest request, String apiKey) {
        try {
            claudeClient.stream(request, apiKey, new TokenSink() {
                @Override
                public void onToken(String text) {
                    out.token(text);
                }

                @Override
                public void onComplete(Usage usage) {
                    // Refusal rides this path too: an empty answer still spent tokens.
                    recordUsageQuietly(userId, model, usage);
                    out.done(usage);
                }

                @Override
                public void onError(ClaudeException error) {
                    out.error(error.getCategory().name(), error.getMessage());
                }
            });
            out.complete();
        } catch (RuntimeException e) {
            // A frame send failed (client disconnected) or an unexpected error mid-stream.
            // The per-run client is already closed as the seam call unwinds; there is no
            // persisted state to mark failed.
            out.completeWithError(e);
        }
    }

    /**
     * Never throws: a failure to record tokens must not turn a generation the
     * User already received into a failed stream.
     */
    private void recordUsageQuietly(UUID userId, String model, Usage usage) {
        try {
            tokenUsageRecorder.record(userId, model, usage);
        } catch (RuntimeException e) {
            log.error("Could not record token usage for user {} on model {}", userId, model, e);
        }
    }
}
