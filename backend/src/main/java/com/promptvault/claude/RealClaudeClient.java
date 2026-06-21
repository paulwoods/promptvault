package com.promptvault.claude;

import com.anthropic.client.AnthropicClient;
import com.anthropic.client.okhttp.AnthropicOkHttpClient;
import com.anthropic.core.http.StreamResponse;
import com.anthropic.errors.AnthropicException;
import com.anthropic.errors.AnthropicIoException;
import com.anthropic.errors.AnthropicServiceException;
import com.anthropic.models.messages.MessageCreateParams;
import com.anthropic.models.messages.RawMessageStreamEvent;
import com.anthropic.models.messages.TextDelta;
import org.springframework.stereotype.Component;

/**
 * Real {@link ClaudeClient} over the official Anthropic Java SDK. A client is
 * built per call from the decrypted key (never shared). Answer-text deltas are
 * pushed to the sink; usage is reported on completion. SDK exceptions are
 * translated to categorized, safe {@link ClaudeException}s. A refusal returns a
 * normal (empty-content) stream that simply completes — it is not a failure.
 */
@Component
public class RealClaudeClient implements ClaudeClient {

    private final ClaudeRequestMapper mapper;

    public RealClaudeClient(ClaudeRequestMapper mapper) {
        this.mapper = mapper;
    }

    @Override
    public void stream(ClaudeRequest request, String apiKey, TokenSink sink) {
        AnthropicClient client = AnthropicOkHttpClient.builder().apiKey(apiKey).build();
        try {
            MessageCreateParams params = mapper.toParams(request);
            long[] inputTokens = {0L};
            long[] outputTokens = {0L};
            try (StreamResponse<RawMessageStreamEvent> stream =
                    client.messages().createStreaming(params)) {
                stream.stream().forEach(event -> {
                    event.messageStart()
                            .ifPresent(start ->
                                    inputTokens[0] = start.message().usage().inputTokens());
                    event.contentBlockDelta()
                            .flatMap(delta -> delta.delta().text())
                            .map(TextDelta::text)
                            .ifPresent(sink::onToken);
                    event.messageDelta()
                            .ifPresent(delta -> outputTokens[0] = delta.usage().outputTokens());
                });
            }
            sink.onComplete(new Usage(Math.toIntExact(inputTokens[0]), Math.toIntExact(outputTokens[0])));
        } catch (AnthropicServiceException e) {
            ErrorCategory category = categoryFor(e.statusCode());
            sink.onError(new ClaudeException(category, safeMessage(category), e));
        } catch (AnthropicIoException e) {
            sink.onError(new ClaudeException(ErrorCategory.NETWORK, "Network error contacting Claude", e));
        } catch (AnthropicException e) {
            sink.onError(new ClaudeException(ErrorCategory.OTHER, "Claude request failed", e));
        } finally {
            client.close();
        }
    }

    private static ErrorCategory categoryFor(int statusCode) {
        return switch (statusCode) {
            case 401, 403 -> ErrorCategory.AUTH;
            case 429 -> ErrorCategory.RATE_LIMIT;
            case 529 -> ErrorCategory.OVERLOADED;
            default -> ErrorCategory.OTHER;
        };
    }

    private static String safeMessage(ErrorCategory category) {
        return switch (category) {
            case AUTH -> "Authentication with Claude failed";
            case RATE_LIMIT -> "Claude rate limit exceeded";
            case OVERLOADED -> "Claude is temporarily overloaded";
            default -> "Claude request failed";
        };
    }
}
