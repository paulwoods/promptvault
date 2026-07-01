package com.promptvault.run;

import static org.assertj.core.api.Assertions.assertThat;

import com.promptvault.claude.ClaudeException;
import com.promptvault.claude.ClaudeRequest;
import com.promptvault.claude.ErrorCategory;
import com.promptvault.claude.FakeClaudeClient;
import com.promptvault.claude.Usage;
import java.io.UncheckedIOException;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

class RunStreamerTest {

    private final FakeClaudeClient fake = new FakeClaudeClient();
    private final RecordingRunStore store = new RecordingRunStore();
    private final RunStreamer streamer = new RunStreamer(fake, store, new ObjectMapper());

    private static Run inProgressRun() {
        return new Run(
                UUID.randomUUID(),
                UUID.randomUUID(),
                UUID.randomUUID(),
                Map.of(),
                "rendered prompt",
                "claude-opus-4-8");
    }

    private static ClaudeRequest request() {
        return new ClaudeRequest("claude-opus-4-8", null, "rendered prompt", 1000, "medium", "off");
    }

    @Test
    void emitsMetaThenTokensThenFinalizesCompletedWithDone() {
        fake.respondWith(List.of("Hello", " world"), new Usage(3, 5));
        Run run = inProgressRun();
        RecordingRunStream out = new RecordingRunStream();

        streamer.stream(out, run, 1, request(), "sk-ant-decrypted");

        assertThat(out.metaRunId).isEqualTo(run.getId());
        assertThat(out.metaVersionNumber).isEqualTo(1);
        assertThat(out.tokens).containsExactly("Hello", " world");
        assertThat(store.completedRunId).isEqualTo(run.getId());
        assertThat(store.completedResponse).isEqualTo("Hello world");
        assertThat(store.completedUsage).isEqualTo(new Usage(3, 5));
        assertThat(out.doneUsage).isEqualTo(new Usage(3, 5));
        assertThat(out.completed).isTrue();
        assertThat(fake.capturedApiKey()).isEqualTo("sk-ant-decrypted");
    }

    @Test
    void refusalFinalizesCompletedWithEmptyResponse() {
        fake.respondWith(List.of(), new Usage(2, 0));
        Run run = inProgressRun();
        RecordingRunStream out = new RecordingRunStream();

        streamer.stream(out, run, 1, request(), "sk-ant");

        assertThat(out.tokens).isEmpty();
        assertThat(store.completedResponse).isEmpty();
        assertThat(out.doneUsage).isEqualTo(new Usage(2, 0));
        assertThat(out.completed).isTrue();
    }

    @Test
    void seamErrorFinalizesFailedWithErrorFrame() {
        fake.failWith(new ClaudeException(ErrorCategory.AUTH, "Authentication with Claude failed"));
        Run run = inProgressRun();
        RecordingRunStream out = new RecordingRunStream();

        streamer.stream(out, run, 1, request(), "sk-ant");

        assertThat(store.failedRunId).isEqualTo(run.getId());
        assertThat(store.failedCategory).isEqualTo("AUTH");
        assertThat(store.failedMessage).isEqualTo("Authentication with Claude failed");
        assertThat(out.errorCategory).isEqualTo("AUTH");
        assertThat(out.errorMessage).isEqualTo("Authentication with Claude failed");
    }

    @Test
    void clientDisconnectAbortsAndFinalizesClientDisconnect() {
        fake.respondWith(List.of("Hello", " world"), new Usage(3, 5));
        Run run = inProgressRun();
        // A stream that fails on the first token send, as if the client had gone.
        int[] tokenAttempts = {0};
        RunStream disconnected = new RecordingRunStream() {
            @Override
            public void token(String text) {
                tokenAttempts[0]++;
                throw new UncheckedIOException(new java.io.IOException("broken pipe"));
            }
        };

        streamer.stream(disconnected, run, 1, request(), "sk-ant");

        assertThat(tokenAttempts[0]).isEqualTo(1); // no further tokens consumed after the failure
        assertThat(store.failedCategory).isEqualTo("CLIENT_DISCONNECT");
        assertThat(store.completedResponse).isNull(); // not finalized completed
    }
}
