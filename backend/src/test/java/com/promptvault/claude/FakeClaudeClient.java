package com.promptvault.claude;

import java.util.List;

/**
 * Test double for {@link ClaudeClient}. Emits configured text deltas then a
 * chosen {@link Usage}, or fails with a chosen {@link ClaudeException}. Captures
 * the API key and request it received so tests can assert decryption and
 * Variable substitution without any network or real key.
 */
public class FakeClaudeClient implements ClaudeClient {

    private List<String> tokens = List.of();
    private Usage usage = new Usage(0, 0);
    private ClaudeException error;
    private Runnable onBeforeComplete = () -> {};

    private String capturedApiKey;
    private ClaudeRequest capturedRequest;

    public void respondWith(List<String> tokens, Usage usage) {
        this.tokens = List.copyOf(tokens);
        this.usage = usage;
        this.error = null;
    }

    public void failWith(ClaudeException error) {
        this.error = error;
    }

    /** Runs on the streaming thread just before onComplete (e.g. to observe mid-stream state). */
    public void setOnBeforeComplete(Runnable onBeforeComplete) {
        this.onBeforeComplete = onBeforeComplete;
    }

    public void reset() {
        this.tokens = List.of();
        this.usage = new Usage(0, 0);
        this.error = null;
        this.onBeforeComplete = () -> {};
        this.capturedApiKey = null;
        this.capturedRequest = null;
    }

    public String capturedApiKey() {
        return capturedApiKey;
    }

    public ClaudeRequest capturedRequest() {
        return capturedRequest;
    }

    @Override
    public void stream(ClaudeRequest request, String apiKey, TokenSink sink) {
        this.capturedApiKey = apiKey;
        this.capturedRequest = request;
        if (error != null) {
            sink.onError(error);
            return;
        }
        for (String token : tokens) {
            sink.onToken(token);
        }
        onBeforeComplete.run();
        sink.onComplete(usage);
    }
}
