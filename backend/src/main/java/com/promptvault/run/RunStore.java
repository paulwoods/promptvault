package com.promptvault.run;

import com.github.f4b6a3.uuid.UuidCreator;
import com.promptvault.activity.ActivityEvent;
import com.promptvault.activity.ActivityRecorder;
import com.promptvault.claude.Usage;
import com.promptvault.prompt.Version;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Persists Run rows in their own committed transactions so the row is observable
 * (story 38) before the stream completes and finalization survives independently
 * of the streaming thread.
 */
@Service
public class RunStore {

    private final RunRepository runs;
    private final ActivityRecorder activityRecorder;

    public RunStore(RunRepository runs, ActivityRecorder activityRecorder) {
        this.runs = runs;
        this.activityRecorder = activityRecorder;
    }

    /**
     * Creates the in_progress Run row and, in the same transaction, records the
     * run_started Activity event (ADR-0006) labeled with the Version's name,
     * followed by the Variable values it was run with (if any).
     */
    @Transactional
    public Run createInProgress(
            UUID userId, Version version, Map<String, String> variableValues, String renderedPrompt) {
        Run run = new Run(
                UuidCreator.getTimeOrderedEpoch(),
                userId,
                version.getId(),
                variableValues,
                renderedPrompt,
                version.getModel());
        runs.save(run);
        activityRecorder.record(
                userId,
                ActivityEvent.RUN_STARTED,
                runLabel(version, variableValues),
                version.getPromptId(),
                version.getNumber(),
                run.getId());
        return run;
    }

    /**
     * The Version's name, plus each Variable's value in declaration order
     * (e.g. {@code "Greeting (topic: rivers, tone: formal)"}); just the name
     * when the Version has no Variables.
     */
    private static String runLabel(Version version, Map<String, String> variableValues) {
        String vars = version.getVariables().stream()
                .filter(v -> variableValues.containsKey(v.name()))
                .map(v -> v.name() + ": " + variableValues.get(v.name()))
                .collect(Collectors.joining(", "));
        return vars.isEmpty() ? version.getName() : version.getName() + " (" + vars + ")";
    }

    @Transactional
    public void finalizeCompleted(UUID runId, String response, Usage usage) {
        load(runId).markCompleted(response, usage.inputTokens(), usage.outputTokens());
    }

    @Transactional
    public void finalizeFailed(UUID runId, String errorCategory, String errorMessage, String partialResponse) {
        load(runId).markFailed(errorCategory, errorMessage, partialResponse);
    }

    private Run load(UUID runId) {
        return runs.findById(runId).orElseThrow(() -> new NoSuchElementException("Run not found: " + runId));
    }
}
