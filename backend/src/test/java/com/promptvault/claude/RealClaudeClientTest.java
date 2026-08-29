package com.promptvault.claude;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.classic.spi.IThrowableProxy;
import ch.qos.logback.core.read.ListAppender;
import com.anthropic.client.AnthropicClient;
import com.anthropic.core.ObjectMappers;
import com.anthropic.core.http.StreamResponse;
import com.anthropic.errors.AnthropicException;
import com.anthropic.errors.AnthropicIoException;
import com.anthropic.errors.AnthropicServiceException;
import com.anthropic.models.messages.MessageCreateParams;
import com.anthropic.models.messages.RawMessageStreamEvent;
import com.anthropic.services.blocking.MessageService;
import com.promptvault.prompt.ModelCatalog;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.slf4j.LoggerFactory;

/**
 * Contract test for the Anthropic adapter driving the SDK wire (no network,
 * no key): the stream event loop forwards text deltas verbatim, thinking deltas
 * stay behind the seam, exactly one sink callback is terminal, each SDK
 * exception surfaces as its category with a safe message, a refusal-shaped
 * (empty) stream still completes, the failure's cause is logged (the safe
 * message is lossy and nothing downstream sees the cause) without carrying the
 * key into the logs, the client is built per call from the key it was handed,
 * and the client closes on every exit path. The production client
 * construction stands in via a subclass; the SDK messages endpoint is a mock,
 * which is where every exception below surfaces from.
 */
class RealClaudeClientTest {

    private final AnthropicClient client = mock(AnthropicClient.class);
    private final MessageService messages = mock(MessageService.class);

    /** The keys handed to {@code newClient}, one per stream() call, in order. */
    private final List<String> clientKeys = new ArrayList<>();

    private final RealClaudeClient claude =
            new RealClaudeClient(new ClaudeRequestMapper(new ModelCatalog())) {
                @Override
                protected AnthropicClient newClient(String apiKey) {
                    clientKeys.add(apiKey);
                    return client;
                }
            };

    private StreamResponse<RawMessageStreamEvent> response = mock(StreamResponse.class);

    @BeforeEach
    void standOnTheSdkWire() {
        when(client.messages()).thenReturn(messages);
    }

    private void streamOf(RawMessageStreamEvent... events) {
        response = mock(StreamResponse.class);
        when(response.stream()).thenAnswer(invocation -> Stream.of(events));
        when(messages.createStreaming(any(MessageCreateParams.class))).thenReturn(response);
    }

    private static RawMessageStreamEvent event(String json) {
        try {
            return ObjectMappers.jsonMapper().readValue(json, RawMessageStreamEvent.class);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private void sdkThrows(RuntimeException e) {
        when(messages.createStreaming(any(MessageCreateParams.class))).thenThrow(e);
    }

    @Test
    void textDeltasReachTheSinkVerbatimAndThinkingStaysBehindTheSeam() {
        streamOf(
                event(
                        """
                        {"type":"message_start","message":{"id":"msg_1","type":"message",
                        "role":"assistant","content":[],"model":"claude-opus-4-8",
                        "usage":{"input_tokens":17,"output_tokens":0}}}"""),
                event(
                        """
                        {"type":"content_block_delta","index":0,
                        "delta":{"type":"text_delta","text":"Good "}}"""),
                event(
                        """
                        {"type":"content_block_delta","index":1,
                        "delta":{"type":"thinking_delta","thinking":"pond"}}"""),
                event(
                        """
                        {"type":"content_block_delta","index":0,
                        "delta":{"type":"text_delta","text":"morning"}}"""),
                event(
                        """
                        {"type":"message_delta","delta":{"type":"text_delta","text":""},
                        "usage":{"output_tokens":42}}"""));
        RecordingSink sink = new RecordingSink();

        claude.stream(request(), "sk-ant-decrypted", sink);

        assertThat(sink.tokens).containsExactly("Good ", "morning");
        assertThat(sink.usage()).isEqualTo(new Usage(17, 42));
        sink.assertExactlyOneTerminalCallback();
        assertThat(clientKeys).containsExactly("sk-ant-decrypted");
        verify(response).close();
        verify(client).close();
    }

    /** A refusal surfaces as an empty-content stream: it completes, it does not fail (Phase 5). */
    @Test
    void anEmptyStreamStillCompletes() {
        streamOf(
                event(
                        """
                        {"type":"message_start","message":{"id":"msg_1","type":"message",
                        "role":"assistant","content":[],"model":"claude-opus-4-8",
                        "usage":{"input_tokens":5,"output_tokens":0}}}"""),
                event(
                        """
                        {"type":"message_delta","delta":{"type":"text_delta","text":""},
                        "usage":{"output_tokens":0}}"""));
        RecordingSink sink = new RecordingSink();

        claude.stream(request(), "sk-ant-decrypted", sink);

        assertThat(sink.tokens).isEmpty();
        assertThat(sink.usage()).isEqualTo(new Usage(5, 0));
        sink.assertExactlyOneTerminalCallback();
        assertThat(sink.errors).isEmpty();
        verify(client).close();
    }

    @ParameterizedTest
    @CsvSource({
        "401, AUTH, Authentication with Claude failed",
        "403, AUTH, Authentication with Claude failed",
        "429, RATE_LIMIT, Claude rate limit exceeded",
        "529, OVERLOADED, Claude is temporarily overloaded",
        "500, OTHER, Claude request failed",
    })
    void aServiceFailureMapsItsStatusToACategory(int statusCode, String category, String safeMessage) {
        AnthropicServiceException boom = mock(AnthropicServiceException.class);
        when(boom.statusCode()).thenReturn(statusCode);
        sdkThrows(boom);
        RecordingSink sink = new RecordingSink();

        claude.stream(request(), "sk-ant-decrypted", sink);

        assertThat(sink.errors).hasSize(1);
        assertThat(sink.errors.get(0).getCategory().name()).isEqualTo(category);
        assertThat(sink.errors.get(0).getMessage()).isEqualTo(safeMessage);
        sink.assertExactlyOneTerminalCallback();
        assertThat(sink.completions).isEmpty();
        verify(client).close();
    }

    @Test
    void anIoFailureMapsToNetwork() {
        sdkThrows(new AnthropicIoException("connection reset", new IllegalStateException("socket")));
        RecordingSink sink = new RecordingSink();

        claude.stream(request(), "sk-ant-decrypted", sink);

        assertThat(sink.errors).hasSize(1);
        assertThat(sink.errors.get(0).getCategory()).isEqualTo(ErrorCategory.NETWORK);
        assertThat(sink.errors.get(0).getMessage()).isEqualTo("Network error contacting Claude");
        sink.assertExactlyOneTerminalCallback();
        verify(client).close();
    }

    @Test
    void anyOtherSdkFailureMapsToOther() {
        sdkThrows(new AnthropicException("mystery"));
        RecordingSink sink = new RecordingSink();

        claude.stream(request(), "sk-ant-decrypted", sink);

        assertThat(sink.errors).hasSize(1);
        assertThat(sink.errors.get(0).getCategory()).isEqualTo(ErrorCategory.OTHER);
        assertThat(sink.errors.get(0).getMessage()).isEqualTo("Claude request failed");
        sink.assertExactlyOneTerminalCallback();
        verify(client).close();
    }

    /**
     * The cause is logged so a failure is diagnosable server-side — the User
     * only ever sees the category's safe message, so without this a 400 is
     * indistinguishable from any other OTHER.
     */
    @Test
    void aFailureLogsItsCauseWithoutTheKey() {
        String canaryKey = "sk-ant-CANARY-do-not-leak";
        ch.qos.logback.classic.Logger root =
                (ch.qos.logback.classic.Logger) LoggerFactory.getLogger(ch.qos.logback.classic.Logger.ROOT_LOGGER_NAME);
        ListAppender<ILoggingEvent> appender = new ListAppender<>();
        appender.start();
        root.addAppender(appender);
        try {
            sdkThrows(new AnthropicException("text content blocks must contain non-whitespace text"));

            claude.stream(request(), canaryKey, new RecordingSink());

            String logs = capturedLogs(appender);
            assertThat(logs).contains("text content blocks must contain non-whitespace text");
            assertThat(logs).doesNotContain(canaryKey);
        } finally {
            root.detachAppender(appender);
        }
    }

    private static String capturedLogs(ListAppender<ILoggingEvent> appender) {
        StringBuilder text = new StringBuilder();
        for (ILoggingEvent event : appender.list) {
            text.append(event.getFormattedMessage()).append('\n');
            IThrowableProxy throwable = event.getThrowableProxy();
            while (throwable != null) {
                text.append(throwable.getClassName())
                        .append(": ")
                        .append(throwable.getMessage())
                        .append('\n');
                throwable = throwable.getCause();
            }
        }
        return text.toString();
    }

    /** One stream call, one client: built from that call's key, closed once, even on failure. */
    @Test
    void everyCallBuildsItsOwnClientFromItsOwnKey() {
        streamOf();
        RecordingSink first = new RecordingSink();
        claude.stream(request(), "sk-ant-first", first);
        sdkThrows(new AnthropicException("mystery"));
        RecordingSink second = new RecordingSink();

        claude.stream(request(), "sk-ant-second", second);

        assertThat(clientKeys).containsExactly("sk-ant-first", "sk-ant-second");
        assertThat(first.usage()).isNotNull();
        assertThat(second.errors).hasSize(1);
        verify(client, times(2)).close();
    }

    private ClaudeRequest request() {
        return new ClaudeRequest("claude-opus-4-8", null, "hi", 100, "medium", "off");
    }

    /** A token sink that records what it was handed so each test can assert the contract. */
    private static final class RecordingSink implements TokenSink {

        final List<String> tokens = new ArrayList<>();
        final List<Usage> completions = new ArrayList<>();
        final List<ClaudeException> errors = new ArrayList<>();

        @Override
        public void onToken(String text) {
            tokens.add(text);
        }

        @Override
        public void onComplete(Usage usage) {
            completions.add(usage);
        }

        @Override
        public void onError(ClaudeException error) {
            errors.add(error);
        }

        Usage usage() {
            assertThat(completions).hasSize(1);
            return completions.get(0);
        }

        void assertExactlyOneTerminalCallback() {
            assertThat(completions.size() + errors.size())
                    .as("exactly one terminal callback")
                    .isEqualTo(1);
        }
    }
}