package com.promptvault.run;

import com.promptvault.claude.ClaudeClient;
import com.promptvault.claude.ClaudeException;
import com.promptvault.claude.ClaudeRequest;
import com.promptvault.claude.TokenSink;
import com.promptvault.claude.Usage;
import java.time.Duration;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import tools.jackson.databind.ObjectMapper;

/**
 * Drives the seam and writes frames to a {@link RunStream}: a leading meta frame,
 * then a token frame per delta. Terminal finalization (done/error + Run row) is
 * added in 6.3/6.4.
 */
@Component
public class RunStreamer {

    private static final long STREAM_TIMEOUT_MS = Duration.ofMinutes(10).toMillis();

    private final ClaudeClient claudeClient;
    private final RunStore runStore;
    private final ObjectMapper objectMapper;

    public RunStreamer(ClaudeClient claudeClient, RunStore runStore, ObjectMapper objectMapper) {
        this.claudeClient = claudeClient;
        this.runStore = runStore;
        this.objectMapper = objectMapper;
    }

    /**
     * Builds the SSE channel for a Run and drives it on its own virtual thread,
     * returning the emitter immediately so the request thread isn't held for the
     * duration of the generation.
     */
    public SseEmitter streamAsync(Run run, int versionNumber, ClaudeRequest request, String apiKey) {
        SseEmitter emitter = new SseEmitter(STREAM_TIMEOUT_MS);
        SseRunStream out = new SseRunStream(emitter, objectMapper);
        Thread.ofVirtual().name("run-stream-", 0).start(() -> stream(out, run, versionNumber, request, apiKey));
        return emitter;
    }

    public void stream(RunStream out, Run run, int versionNumber, ClaudeRequest request, String apiKey) {
        StringBuilder response = new StringBuilder();
        boolean[] finalized = {false};
        try {
            out.meta(run.getId(), versionNumber);
            claudeClient.stream(request, apiKey, new TokenSink() {
                @Override
                public void onToken(String text) {
                    response.append(text);
                    out.token(text);
                }

                @Override
                public void onComplete(Usage usage) {
                    // Refusal rides this path too: empty answer text still finalizes completed.
                    runStore.finalizeCompleted(run.getId(), response.toString(), usage);
                    finalized[0] = true;
                    out.done(usage);
                }

                @Override
                public void onError(ClaudeException error) {
                    runStore.finalizeFailed(
                            run.getId(), error.getCategory().name(), error.getMessage(), response.toString());
                    finalized[0] = true;
                    out.error(error.getCategory().name(), error.getMessage());
                }
            });
            out.complete();
        } catch (RuntimeException e) {
            // A frame send failed (client disconnected) or an unexpected error mid-stream.
            // The per-Run client is already closed as the seam call unwinds.
            if (!finalized[0]) {
                runStore.finalizeFailed(run.getId(), "CLIENT_DISCONNECT", "Client disconnected", response.toString());
            }
            out.completeWithError(e);
        }
    }
}
