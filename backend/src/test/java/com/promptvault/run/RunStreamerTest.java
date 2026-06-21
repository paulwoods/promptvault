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
    private final RunStreamer streamer = new RunStreamer(fake);

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
    void emitsMetaThenTokenFramesFromTheSeam() {
        fake.respondWith(List.of("Hello", " world"), new Usage(3, 5));
        Run run = inProgressRun();
        RecordingRunStream out = new RecordingRunStream();

        streamer.stream(out, run, 1, request(), "sk-ant-decrypted");

        assertThat(out.metaRunId).isEqualTo(run.getId());
        assertThat(out.metaVersionNumber).isEqualTo(1);
        assertThat(out.tokens).containsExactly("Hello", " world");
        assertThat(out.completed).isTrue();
        // The Run was in_progress while it streamed (finalization arrives in 6.3).
        assertThat(run.getStatus()).isEqualTo(Run.IN_PROGRESS);
        assertThat(fake.capturedApiKey()).isEqualTo("sk-ant-decrypted");
    }
}
