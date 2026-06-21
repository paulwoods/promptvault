package com.promptvault.run;

import com.promptvault.claude.Usage;
import java.util.UUID;

/** Records finalization calls for streamer unit tests (no database). */
public class RecordingRunStore extends RunStore {

    UUID completedRunId;
    String completedResponse;
    Usage completedUsage;

    public RecordingRunStore() {
        super(null);
    }

    @Override
    public void finalizeCompleted(UUID runId, String response, Usage usage) {
        this.completedRunId = runId;
        this.completedResponse = response;
        this.completedUsage = usage;
    }
}
