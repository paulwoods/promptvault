package com.promptvault.run;

import static org.assertj.core.api.Assertions.assertThat;

import com.promptvault.claude.ClaudeRequest;
import com.promptvault.claude.FakeClaudeClient;
import com.promptvault.claude.Usage;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class RunStreamerTest {

    private final FakeClaudeClient fake = new FakeClaudeClient();
    private final RecordingRunStore store = new RecordingRunStore();
    private final RunStreamer streamer = new RunStreamer(fake, store);

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
}
