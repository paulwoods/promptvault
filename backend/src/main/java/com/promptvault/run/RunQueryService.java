package com.promptvault.run;

import com.promptvault.common.Page;
import com.promptvault.common.Pagination;
import com.promptvault.error.DomainValidationException;
import com.promptvault.error.ResourceNotFoundException;
import com.promptvault.prompt.PromptRepository;
import com.promptvault.prompt.Version;
import com.promptvault.prompt.VersionRepository;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.data.domain.Slice;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

/** Owner-scoped reads of Run history (lists carry previews; single-run carries full detail). */
@Service
public class RunQueryService {

    private static final int PREVIEW_LENGTH = 200;

    private static final Set<String> STATUSES = Set.of(Run.IN_PROGRESS, Run.COMPLETED, Run.FAILED);

    private final RunRepository runs;
    private final PromptRepository prompts;
    private final VersionRepository versions;

    public RunQueryService(RunRepository runs, PromptRepository prompts, VersionRepository versions) {
        this.runs = runs;
        this.prompts = prompts;
        this.versions = versions;
    }

    /**
     * All runs across every Version of the prompt, tagged with each run's
     * Version number. {@code status} optionally restricts to one of
     * completed/failed/in_progress (9.1.2); blank/null returns all statuses.
     * Paginated (9.2.2) — {@code page} is 1-based and defaults to 1.
     */
    @Transactional(readOnly = true)
    public Page<RunSummary> listByPrompt(UUID userId, UUID promptId, String status, Integer page) {
        requireOwnedPrompt(userId, promptId);
        Map<UUID, Integer> versionNumbers = versions.findByPromptIdOrderByNumberDesc(promptId).stream()
                .collect(Collectors.toMap(Version::getId, Version::getNumber));
        Slice<Run> slice = runs.findByUserIdAndPromptId(userId, promptId, normalizeStatus(status), Pagination.of(page));
        List<RunSummary> items = slice.getContent().stream()
                .map(run -> toSummary(run, versionNumbers.getOrDefault(run.getVersionId(), 0)))
                .toList();
        return new Page<>(items, slice.hasNext());
    }

    @Transactional(readOnly = true)
    public Page<RunSummary> listByVersion(UUID userId, UUID promptId, int versionNumber, String status, Integer page) {
        requireOwnedPrompt(userId, promptId);
        Version version = versions.findByPromptIdAndNumber(promptId, versionNumber)
                .orElseThrow(() -> new ResourceNotFoundException("Version not found"));
        Slice<Run> slice = runs.findByUserIdAndVersionIdAndStatus(
                userId, version.getId(), normalizeStatus(status), Pagination.of(page));
        List<RunSummary> items = slice.getContent().stream()
                .map(run -> toSummary(run, versionNumber))
                .toList();
        return new Page<>(items, slice.hasNext());
    }

    /** Blank/null means no filter; a value outside the known statuses is a validation error (400). */
    private static String normalizeStatus(String status) {
        if (!StringUtils.hasText(status)) {
            return null;
        }
        if (!STATUSES.contains(status)) {
            throw new DomainValidationException("status", "Invalid status: " + status);
        }
        return status;
    }

    @Transactional(readOnly = true)
    public RunDetail getRun(UUID userId, UUID runId) {
        Run run = runs.findActiveByIdAndUserId(runId, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Run not found"));
        int versionNumber =
                versions.findById(run.getVersionId()).map(Version::getNumber).orElse(0);
        return new RunDetail(
                run.getId(),
                versionNumber,
                run.getModel(),
                run.getVariableValues(),
                run.getRenderedPrompt(),
                run.getResponse(),
                run.getInputTokens(),
                run.getOutputTokens(),
                run.getStatus(),
                run.getErrorCategory(),
                run.getErrorMessage(),
                run.getCreatedAt());
    }

    /** All-time input/output token totals grouped by model, across all of the User's Runs. */
    @Transactional(readOnly = true)
    public List<ModelUsage> usage(UUID userId) {
        return runs.sumTokensByModel(userId);
    }

    private void requireOwnedPrompt(UUID userId, UUID promptId) {
        prompts.findByIdAndUserIdAndDeletedAtIsNull(promptId, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Prompt not found"));
    }

    private RunSummary toSummary(Run run, int versionNumber) {
        return new RunSummary(
                run.getId(), versionNumber, run.getStatus(), preview(run.getResponse()), run.getCreatedAt());
    }

    private static String preview(String response) {
        if (response == null) {
            return null;
        }
        return response.length() <= PREVIEW_LENGTH ? response : response.substring(0, PREVIEW_LENGTH);
    }
}
