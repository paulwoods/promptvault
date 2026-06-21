package com.promptvault.claude;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

class FakeClaudeClientTest {

    private final FakeClaudeClient fake = new FakeClaudeClient();

    private record Recording(List<String> tokens, Usage usage, ClaudeException error) {}

    private Recording drive(ClaudeRequest request, String apiKey) {
        List<String> tokens = new ArrayList<>();
        Usage[] usage = new Usage[1];
        ClaudeException[] error = new ClaudeException[1];
        fake.stream(request, apiKey, new TokenSink() {
            @Override
            public void onToken(String text) {
                tokens.add(text);
            }

            @Override
            public void onComplete(Usage completedUsage) {
                usage[0] = completedUsage;
            }

            @Override
            public void onError(ClaudeException claudeError) {
                error[0] = claudeError;
            }
        });
        return new Recording(tokens, usage[0], error[0]);
    }

    @Test
    void emitsTokensThenUsageAndCapturesKeyAndRequest() {
        fake.respondWith(List.of("Hello", " world"), new Usage(7, 11));
        ClaudeRequest request = new ClaudeRequest("claude-opus-4-8", "sys", "rendered prompt", 100, "high", "off");

        Recording recording = drive(request, "sk-ant-decrypted");

        assertThat(recording.tokens()).containsExactly("Hello", " world");
        assertThat(recording.usage()).isEqualTo(new Usage(7, 11));
        assertThat(recording.error()).isNull();
        assertThat(fake.capturedApiKey()).isEqualTo("sk-ant-decrypted");
        assertThat(fake.capturedRequest().userMessage()).isEqualTo("rendered prompt");
    }

    @Test
    void failsWithChosenCategory() {
        fake.failWith(new ClaudeException(ErrorCategory.RATE_LIMIT, "slow down"));

        Recording recording = drive(new ClaudeRequest("claude-opus-4-8", null, "x", 100, "medium", "off"), "sk-ant");

        assertThat(recording.tokens()).isEmpty();
        assertThat(recording.usage()).isNull();
        assertThat(recording.error().getCategory()).isEqualTo(ErrorCategory.RATE_LIMIT);
    }
}
