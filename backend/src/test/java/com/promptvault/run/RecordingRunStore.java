package com.promptvault.run;

import com.promptvault.claude.Usage;
import java.util.UUID;

/** Records finalization calls for streamer unit tests (no database). */
public class RecordingRunStore extends RunStore {

    UUID completedRunId;
    String completedResponse;
    Usage completedUsage;

    UUID failedRunId;
    String failedCategory;
    String failedMessage;
    String failedPartialResponse;

    public RecordingRunStore() {
        super(null, null);
    }

    @Override
    public void finalizeCompleted(UUID runId, String response, Usage usage) {
        this.completedRunId = runId;
        this.completedResponse = response;
        this.completedUsage = usage;
    }

    @Override
    public void finalizeFailed(UUID runId, String errorCategory, String errorMessage, String partialResponse) {
        this.failedRunId = runId;
        this.failedCategory = errorCategory;
        this.failedMessage = errorMessage;
        this.failedPartialResponse = partialResponse;
    }

    public String failedMessageOrEmpty() {
        return failedMessage == null ? "" : failedMessage;
    }
}
