package com.promptvault.run;

import com.promptvault.claude.Usage;

/**
 * The output channel for a streamed run — the three named frames plus stream
 * lifecycle. Backed by SSE in production ({@link SseRunStream}); a recording
 * implementation drives deterministic tests.
 */
public interface RunStream {

    void token(String text);

    void done(Usage usage);

    void error(String category, String message);

    void complete();

    void completeWithError(Throwable throwable);
}
