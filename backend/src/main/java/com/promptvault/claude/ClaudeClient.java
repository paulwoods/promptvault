package com.promptvault.claude;

/**
 * The model boundary. A blocking push: text deltas are delivered to the sink as
 * they arrive, then exactly one terminal callback (onComplete or onError). The
 * API key is passed per call (never a shared/singleton key). No Anthropic SDK
 * type crosses this seam.
 */
public interface ClaudeClient {

    void stream(ClaudeRequest request, String apiKey, TokenSink sink);
}
