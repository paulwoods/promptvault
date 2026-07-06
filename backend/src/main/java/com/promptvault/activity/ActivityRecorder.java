package com.promptvault.activity;

import com.github.f4b6a3.uuid.UuidCreator;
import java.util.UUID;
import org.springframework.stereotype.Service;

/**
 * Writes one Activity event (ADR-0006) inside the caller's existing
 * transaction. Deliberately not {@code @Transactional} itself: a save failure
 * must propagate and roll back the caller's mutation rather than being
 * isolated in a transaction of its own.
 */
@Service
public class ActivityRecorder {

    private final ActivityEventRepository activityEvents;

    public ActivityRecorder(ActivityEventRepository activityEvents) {
        this.activityEvents = activityEvents;
    }

    /** For event types with no Prompt/Version/Run context (registered, logged_in, name_changed, api_key_set). */
    public void record(UUID userId, String type, String label) {
        record(userId, type, label, null, null, null);
    }

    /** For Prompt/Version-scoped events (prompt_created, version_saved, prompt_deleted, prompt_restored). */
    public void record(UUID userId, String type, String label, UUID promptId, Integer versionNumber) {
        record(userId, type, label, promptId, versionNumber, null);
    }

    /** For run_started, which also carries the Run's id. */
    public void record(UUID userId, String type, String label, UUID promptId, Integer versionNumber, UUID runId) {
        activityEvents.save(new ActivityEvent(
                UuidCreator.getTimeOrderedEpoch(), userId, type, promptId, versionNumber, runId, label));
    }
}
