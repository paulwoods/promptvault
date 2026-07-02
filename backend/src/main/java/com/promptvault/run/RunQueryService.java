package com.promptvault.run;

import com.promptvault.error.ResourceNotFoundException;
import com.promptvault.prompt.PromptRepository;
import com.promptvault.prompt.Version;
import com.promptvault.prompt.VersionRepository;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Owner-scoped reads of Run history (lists carry previews; single-run carries full detail). */
@Service
public class RunQueryService {

    private static final int PREVIEW_LENGTH = 200;

    private final RunRepository runs;
    private final PromptRepository prompts;
    private final VersionRepository versions;

    public RunQueryService(RunRepository runs, PromptRepository prompts, VersionRepository versions) {
        this.runs = runs;
        this.prompts = prompts;
        this.versions = versions;
    }

    /** All runs across every Version of the prompt, tagged with each run's Version number. */
    @Transactional(readOnly = true)
    public List<RunSummary> listByPrompt(UUID userId, UUID promptId) {
        requireOwnedPrompt(userId, promptId);
        Map<UUID, Integer> versionNumbers = versions.findByPromptIdOrderByNumberDesc(promptId).stream()
                .collect(Collectors.toMap(Version::getId, Version::getNumber));
        return runs.findByUserIdAndPromptId(userId, promptId).stream()
                .map(run -> toSummary(run, versionNumbers.getOrDefault(run.getVersionId(), 0)))
                .toList();
    }

    @Transactional(readOnly = true)
    public List<RunSummary> listByVersion(UUID userId, UUID promptId, int versionNumber) {
        requireOwnedPrompt(userId, promptId);
        Version version = versions.findByPromptIdAndNumber(promptId, versionNumber)
                .orElseThrow(() -> new ResourceNotFoundException("Version not found"));
        return runs.findByUserIdAndVersionIdOrderByCreatedAtDesc(userId, version.getId()).stream()
                .map(run -> toSummary(run, versionNumber))
                .toList();
    }

    @Transactional(readOnly = true)
    public RunDetail getRun(UUID userId, UUID runId) {
        Run run =
                runs.findByIdAndUserId(runId, userId).orElseThrow(() -> new ResourceNotFoundException("Run not found"));
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
        prompts.findByIdAndUserId(promptId, userId)
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
