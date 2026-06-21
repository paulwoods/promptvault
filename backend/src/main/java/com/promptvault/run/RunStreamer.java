package com.promptvault.run;

import com.promptvault.claude.ClaudeClient;
import com.promptvault.claude.ClaudeException;
import com.promptvault.claude.ClaudeRequest;
import com.promptvault.claude.TokenSink;
import com.promptvault.claude.Usage;
import org.springframework.stereotype.Component;

/**
 * Drives the seam and writes frames to a {@link RunStream}: a leading meta frame,
 * then a token frame per delta. Terminal finalization (done/error + Run row) is
 * added in 6.3/6.4.
 */
@Component
public class RunStreamer {

    private final ClaudeClient claudeClient;
    private final RunStore runStore;

    public RunStreamer(ClaudeClient claudeClient, RunStore runStore) {
        this.claudeClient = claudeClient;
        this.runStore = runStore;
    }

    public void stream(RunStream out, Run run, int versionNumber, ClaudeRequest request, String apiKey) {
        StringBuilder response = new StringBuilder();
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
                    out.done(usage);
                }

                @Override
                public void onError(ClaudeException error) {
                    // 6.4: finalize the Run failed and emit the terminal error frame.
                }
            });
            out.complete();
        } catch (RuntimeException e) {
            out.completeWithError(e);
        }
    }
}
