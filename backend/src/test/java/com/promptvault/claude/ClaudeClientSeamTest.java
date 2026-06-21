package com.promptvault.claude;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

/** The seam compiles and is satisfiable by a plain implementation driving a sink. */
class ClaudeClientSeamTest {

    @Test
    void implementationCanDriveTheSink() {
        ClaudeClient client = (request, apiKey, sink) -> {
            sink.onToken("Hello, ");
            sink.onToken(request.userMessage());
            sink.onComplete(new Usage(3, 5));
        };

        List<String> tokens = new ArrayList<>();
        Usage[] usage = new Usage[1];
        client.stream(
                new ClaudeRequest("claude-opus-4-8", null, "world", 100, "medium", "off"), "sk-test", new TokenSink() {
                    @Override
                    public void onToken(String text) {
                        tokens.add(text);
                    }

                    @Override
                    public void onComplete(Usage completedUsage) {
                        usage[0] = completedUsage;
                    }

                    @Override
                    public void onError(ClaudeException error) {
                        throw new AssertionError("unexpected error", error);
                    }
                });

        assertThat(tokens).containsExactly("Hello, ", "world");
        assertThat(usage[0]).isEqualTo(new Usage(3, 5));
    }

    @Test
    void errorPathCarriesCategory() {
        ClaudeException error = new ClaudeException(ErrorCategory.AUTH, "bad key");
        assertThat(error.getCategory()).isEqualTo(ErrorCategory.AUTH);
    }
}
