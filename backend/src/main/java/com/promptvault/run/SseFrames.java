package com.promptvault.run;

/** The named SSE frame payloads (JSON-serialized as the event data). */
final class SseFrames {

    private SseFrames() {}

    record Token(String text) {}

    record Done(String status, UsagePayload usage) {}

    record UsagePayload(int inputTokens, int outputTokens) {}

    record Error(String status, String category, String message) {}
}
