package com.promptvault.run;

import com.promptvault.claude.Usage;
import java.io.IOException;
import java.io.UncheckedIOException;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import tools.jackson.databind.ObjectMapper;

/** Writes run frames to an {@link SseEmitter} as named, JSON-data SSE events. */
public class SseRunStream implements RunStream {

    private final SseEmitter emitter;
    private final ObjectMapper objectMapper;

    public SseRunStream(SseEmitter emitter, ObjectMapper objectMapper) {
        this.emitter = emitter;
        this.objectMapper = objectMapper;
    }

    @Override
    public void token(String text) {
        send("token", new SseFrames.Token(text));
    }

    @Override
    public void done(Usage usage) {
        send(
                "done",
                new SseFrames.Done("completed", new SseFrames.UsagePayload(usage.inputTokens(), usage.outputTokens())));
    }

    @Override
    public void error(String category, String message) {
        send("error", new SseFrames.Error("failed", category, message));
    }

    @Override
    public void complete() {
        emitter.complete();
    }

    @Override
    public void completeWithError(Throwable throwable) {
        emitter.completeWithError(throwable);
    }

    private void send(String event, Object data) {
        try {
            emitter.send(SseEmitter.event().name(event).data(objectMapper.writeValueAsString(data)));
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
