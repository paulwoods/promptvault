package com.promptvault.run;

import com.promptvault.claude.Usage;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/** Records Run frames for deterministic streaming tests. */
public class RecordingRunStream implements RunStream {

    UUID metaRunId;
    int metaVersionNumber;
    final List<String> tokens = new ArrayList<>();
    Usage doneUsage;
    String errorCategory;
    String errorMessage;
    boolean completed;
    Throwable failedWith;

    @Override
    public void meta(UUID runId, int versionNumber) {
        this.metaRunId = runId;
        this.metaVersionNumber = versionNumber;
    }

    @Override
    public void token(String text) {
        tokens.add(text);
    }

    @Override
    public void done(Usage usage) {
        this.doneUsage = usage;
    }

    @Override
    public void error(String category, String message) {
        this.errorCategory = category;
        this.errorMessage = message;
    }

    @Override
    public void complete() {
        this.completed = true;
    }

    @Override
    public void completeWithError(Throwable throwable) {
        this.failedWith = throwable;
    }
}
