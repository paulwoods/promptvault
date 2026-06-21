package com.promptvault.claude;

/** Blocking push callback for a streamed generation. Exactly one of onComplete/onError is terminal. */
public interface TokenSink {

    void onToken(String text);

    void onComplete(Usage usage);

    void onError(ClaudeException error);
}
