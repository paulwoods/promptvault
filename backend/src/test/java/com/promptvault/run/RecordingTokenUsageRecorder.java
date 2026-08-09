package com.promptvault.run;

import com.promptvault.claude.Usage;
import com.promptvault.usage.TokenUsageRecorder;
import java.util.UUID;

/**
 * Records what the streamer reported instead of touching the database. Passing a
 * null repository is safe because {@link #record} is fully overridden.
 */
public class RecordingTokenUsageRecorder extends TokenUsageRecorder {

    UUID userId;
    String model;
    Usage usage;

    public RecordingTokenUsageRecorder() {
        super(null);
    }

    @Override
    public void record(UUID userId, String model, Usage usage) {
        this.userId = userId;
        this.model = model;
        this.usage = usage;
    }
}
