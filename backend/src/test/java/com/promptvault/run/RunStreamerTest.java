package com.promptvault.run;

import static org.assertj.core.api.Assertions.assertThat;

import com.promptvault.claude.ClaudeException;
import com.promptvault.claude.ClaudeRequest;
import com.promptvault.claude.ErrorCategory;
import com.promptvault.claude.FakeClaudeClient;
import com.promptvault.claude.Usage;
import java.io.UncheckedIOException;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

class RunStreamerTest {

    private static final String MODEL = "claude-opus-4-8";

    private final UUID userId = UUID.randomUUID();
    private final FakeClaudeClient fake = new FakeClaudeClient();
    private final RecordingTokenUsageRecorder recorder = new RecordingTokenUsageRecorder();
    private final RunStreamer streamer = new RunStreamer(fake, recorder, new ObjectMapper());

    private static ClaudeRequest request() {
        return new ClaudeRequest(MODEL, null, "prompt text", 1000, "medium", "off");
    }

    @Test
    void emitsTokensThenDoneAndRecordsTokenUsage() {
        fake.respondWith(List.of("Hello", " world"), new Usage(3, 5));
        RecordingRunStream out = new RecordingRunStream();

        streamer.stream(out, userId, MODEL, request(), "sk-ant-decrypted");

        assertThat(out.tokens).containsExactly("Hello", " world");
        assertThat(out.doneUsage).isEqualTo(new Usage(3, 5));
        assertThat(out.completed).isTrue();
        assertThat(recorder.userId).isEqualTo(userId);
        assertThat(recorder.model).isEqualTo(MODEL);
        assertThat(recorder.usage).isEqualTo(new Usage(3, 5));
        assertThat(fake.capturedApiKey()).isEqualTo("sk-ant-decrypted");
    }

    @Test
    void refusalCompletesAndStillRecordsTheTokensItSpent() {
        fake.respondWith(List.of(), new Usage(2, 0));
        RecordingRunStream out = new RecordingRunStream();

        streamer.stream(out, userId, MODEL, request(), "sk-ant");

        assertThat(out.tokens).isEmpty();
        assertThat(out.doneUsage).isEqualTo(new Usage(2, 0));
        assertThat(out.completed).isTrue();
        assertThat(recorder.usage).isEqualTo(new Usage(2, 0));
    }

    @Test
    void seamErrorEmitsErrorFrameAndRecordsNoUsage() {
        fake.failWith(new ClaudeException(ErrorCategory.AUTH, "Authentication with Claude failed"));
        RecordingRunStream out = new RecordingRunStream();

        streamer.stream(out, userId, MODEL, request(), "sk-ant");

        assertThat(out.errorCategory).isEqualTo("AUTH");
        assertThat(out.errorMessage).isEqualTo("Authentication with Claude failed");
        assertThat(recorder.usage).isNull();
    }

    @Test
    void aFailedUsageWriteDoesNotFailAGenerationTheUserAlreadyReceived() {
        fake.respondWith(List.of("Hello"), new Usage(1, 1));
        TokenUsageRecorderStub failing = new TokenUsageRecorderStub();
        RunStreamer failingStreamer = new RunStreamer(fake, failing, new ObjectMapper());
        RecordingRunStream out = new RecordingRunStream();

        failingStreamer.stream(out, userId, MODEL, request(), "sk-ant");

        assertThat(out.tokens).containsExactly("Hello");
        assertThat(out.doneUsage).isEqualTo(new Usage(1, 1));
        assertThat(out.completed).isTrue();
        assertThat(out.failedWith).isNull();
    }

    @Test
    void clientDisconnectAbortsWithoutConsumingFurtherTokens() {
        fake.respondWith(List.of("Hello", " world"), new Usage(3, 5));
        int[] tokenAttempts = {0};
        RunStream disconnected = new RecordingRunStream() {
            @Override
            public void token(String text) {
                tokenAttempts[0]++;
                throw new UncheckedIOException(new java.io.IOException("broken pipe"));
            }
        };

        streamer.stream(disconnected, userId, MODEL, request(), "sk-ant");

        assertThat(tokenAttempts[0]).isEqualTo(1); // no further tokens consumed after the failure
        assertThat(recorder.usage).isNull(); // an aborted run spends nothing it can account for
    }

    /** A recorder whose write always fails. */
    private static class TokenUsageRecorderStub extends RecordingTokenUsageRecorder {
        @Override
        public void record(UUID userId, String model, Usage usage) {
            throw new IllegalStateException("db down");
        }
    }
}
