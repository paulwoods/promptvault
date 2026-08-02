package com.promptvault.error;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.promptvault.IntegrationTest;
import com.promptvault.support.TestTokens;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

/**
 * The controller entry logs run at DEBUG, so they are silent in a default test
 * run. This test forces them on and asserts that credentials never reach them —
 * and that the lines were genuinely emitted, so it cannot pass by logging
 * nothing.
 */
class ControllerLogLeakTest extends IntegrationTest {

    private static final String CANARY_PASSWORD = "CANARY-password-do-not-leak";
    private static final String CANARY_KEY = "sk-ant-CANARY-do-not-leak";

    @Autowired
    private MockMvc mockMvc;

    @Test
    void controllerDebugLogsDoNotLeakCredentials() throws Exception {
        Logger appLogger = (Logger) LoggerFactory.getLogger("com.promptvault");
        Level originalLevel = appLogger.getLevel();
        ListAppender<ILoggingEvent> appender = new ListAppender<>();
        appender.start();
        appLogger.addAppender(appender);
        appLogger.setLevel(Level.DEBUG);
        try {
            String token = "Bearer " + TestTokens.registerAndLogin(mockMvc, "canary@example.com", CANARY_PASSWORD);

            mockMvc.perform(put("/api/me/api-key")
                            .header(HttpHeaders.AUTHORIZATION, token)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"apiKey\":\"%s\"}".formatted(CANARY_KEY)))
                    .andExpect(status().isNoContent());

            StringBuilder text = new StringBuilder();
            for (ILoggingEvent event : appender.list) {
                text.append(event.getFormattedMessage()).append('\n');
            }
            String logs = text.toString();

            // The debug lines really fired — otherwise the assertions below are vacuous.
            assertThat(logs).contains("register(email=canary@example.com, password=***)");
            assertThat(logs).contains("login(email=canary@example.com, password=***)");
            assertThat(logs).contains("setApiKey(userId=");

            // ...and neither secret appears anywhere in them.
            assertThat(logs).doesNotContain(CANARY_PASSWORD);
            assertThat(logs).doesNotContain(CANARY_KEY);
        } finally {
            appLogger.setLevel(originalLevel);
            appLogger.detachAppender(appender);
        }
    }
}
