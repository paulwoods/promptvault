package com.promptvault.error;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.classic.spi.IThrowableProxy;
import ch.qos.logback.core.read.ListAppender;
import com.promptvault.claude.ClaudeException;
import com.promptvault.claude.ClaudeRequest;
import com.promptvault.claude.ErrorCategory;
import com.promptvault.claude.FakeClaudeClient;
import com.promptvault.run.RecordingRunStream;
import com.promptvault.run.RecordingTokenUsageRecorder;
import com.promptvault.run.RunStreamer;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.ObjectMapper;

/** Secrets must never appear in any response body or in the logs. */
class LeakHygieneTest {

    private static final String CANARY_KEY = "sk-ant-CANARY-do-not-leak";

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

    @Test
    void failedRunDoesNotLeakTheDecryptedKey() {
        Logger root = (Logger) LoggerFactory.getLogger(Logger.ROOT_LOGGER_NAME);
        ListAppender<ILoggingEvent> appender = new ListAppender<>();
        appender.start();
        root.addAppender(appender);
        try {
            FakeClaudeClient fake = new FakeClaudeClient();
            fake.failWith(new ClaudeException(ErrorCategory.AUTH, "Authentication with Claude failed"));
            RunStreamer streamer = new RunStreamer(fake, new RecordingTokenUsageRecorder(), new ObjectMapper());
            RecordingRunStream out = new RecordingRunStream();

            streamer.stream(
                    out,
                    UUID.randomUUID(),
                    "claude-opus-4-8",
                    new ClaudeRequest("claude-opus-4-8", null, "rendered prompt", 1000, "medium", "off"),
                    CANARY_KEY);

            // The key was genuinely in scope (the client received it)...
            assertThat(fake.capturedApiKey()).isEqualTo(CANARY_KEY);
            // ...but it must not appear in the error frame or the logs.
            assertThat(out.failedMessageOrEmpty()).doesNotContain(CANARY_KEY);
            assertThat(capturedLogs(appender)).doesNotContain(CANARY_KEY);
        } finally {
            root.detachAppender(appender);
        }
    }

    @RestController
    static class ThrowingController {
        @GetMapping("/boom")
        String boom() {
            throw new RuntimeException("internal stack detail");
        }
    }

    @Test
    void unexpectedErrorResponseHasNoInternals() throws Exception {
        MockMvc mockMvc = MockMvcBuilders.standaloneSetup(new ThrowingController())
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();

        String body = mockMvc.perform(get("/boom"))
                .andExpect(status().isInternalServerError())
                .andReturn()
                .getResponse()
                .getContentAsString();

        assertThat(body).doesNotContain("internal stack detail");
        assertThat(body).doesNotContain("RuntimeException");
        assertThat(body).doesNotContain(CANARY_KEY);
    }
}
