package com.promptvault.run;

import com.github.f4b6a3.uuid.UuidCreator;
import java.util.Map;
import java.util.UUID;
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

    public RunStore(RunRepository runs) {
        this.runs = runs;
    }

    @Transactional
    public Run createInProgress(
            UUID userId, UUID versionId, Map<String, String> variableValues, String renderedPrompt, String model) {
        Run run = new Run(UuidCreator.getTimeOrderedEpoch(), userId, versionId, variableValues, renderedPrompt, model);
        return runs.save(run);
    }
}
