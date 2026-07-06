package com.promptvault.activity;

import com.promptvault.common.Page;
import com.promptvault.common.Pagination;
import com.promptvault.run.Run;
import com.promptvault.run.RunRepository;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.data.domain.Slice;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Owner-scoped reads of the Activity feed (ADR-0006), newest first. */
@Service
public class ActivityQueryService {

    private final ActivityEventRepository activityEvents;
    private final RunRepository runs;

    public ActivityQueryService(ActivityEventRepository activityEvents, RunRepository runs) {
        this.activityEvents = activityEvents;
        this.runs = runs;
    }

    @Transactional(readOnly = true)
    public Page<ActivityItem> list(UUID userId, Integer page) {
        Slice<ActivityEvent> slice = activityEvents.findByUserId(userId, Pagination.of(page));
        List<ActivityEvent> content = slice.getContent();
        Map<UUID, String> runStatuses = runStatusesFor(content);
        List<ActivityItem> items =
                content.stream().map(event -> toItem(event, runStatuses)).toList();
        return new Page<>(items, slice.hasNext());
    }

    /**
     * run_started items are enriched with the Run's live status via a single
     * batched PK lookup (never re-derived otherwise, per ADR-0006's
     * Trash-visibility rule) — one query per page rather than one per row.
     */
    private Map<UUID, String> runStatusesFor(List<ActivityEvent> events) {
        List<UUID> runIds = events.stream()
                .filter(e -> ActivityEvent.RUN_STARTED.equals(e.getType()))
                .map(ActivityEvent::getRunId)
                .toList();
        if (runIds.isEmpty()) {
            return Map.of();
        }
        return runs.findAllById(runIds).stream().collect(Collectors.toMap(Run::getId, Run::getStatus));
    }

    private ActivityItem toItem(ActivityEvent event, Map<UUID, String> runStatuses) {
        String runStatus = ActivityEvent.RUN_STARTED.equals(event.getType()) ? runStatuses.get(event.getRunId()) : null;
        return new ActivityItem(
                event.getId(),
                event.getType(),
                event.getOccurredAt(),
                event.getLabel(),
                event.getVersionNumber(),
                runStatus);
    }
}
