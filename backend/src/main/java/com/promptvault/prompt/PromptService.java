package com.promptvault.prompt;

import com.github.f4b6a3.uuid.UuidCreator;
import com.promptvault.common.Page;
import com.promptvault.common.Pagination;
import com.promptvault.error.ResourceNotFoundException;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Slice;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
public class PromptService {

    private final PromptRepository prompts;
    private final VersionRepository versions;
    private final RunSettingsValidator runSettingsValidator;
    private final VariableValidator variableValidator;
    private final PlaceholderValidator placeholderValidator;

    public PromptService(
            PromptRepository prompts,
            VersionRepository versions,
            RunSettingsValidator runSettingsValidator,
            VariableValidator variableValidator,
            PlaceholderValidator placeholderValidator) {
        this.prompts = prompts;
        this.versions = versions;
        this.runSettingsValidator = runSettingsValidator;
        this.variableValidator = variableValidator;
        this.placeholderValidator = placeholderValidator;
    }

    /** Creates a Prompt and its Version 1 from the full snapshot. */
    @Transactional
    public Version createPrompt(UUID userId, VersionRequest request) {
        Prompt prompt = new Prompt(UuidCreator.getTimeOrderedEpoch(), userId);
        prompts.save(prompt);
        return appendVersion(prompt.getId(), request);
    }

    /**
     * Appends the next Version to the caller's prompt (covers edit and rename).
     * Cross-user or Trashed (ADR-0004) -> 404.
     */
    @Transactional
    public Version addVersion(UUID userId, UUID promptId, VersionRequest request) {
        if (prompts.findByIdAndUserIdAndDeletedAtIsNull(promptId, userId).isEmpty()) {
            throw new ResourceNotFoundException("Prompt not found");
        }
        return appendVersion(promptId, request);
    }

    /**
     * Lists the caller's prompts, each summarized by its current Version.
     * When {@code q} is non-blank, restricts to prompts whose current Version's
     * name or description contains it (case-insensitive substring, 9.1.1);
     * omitted/blank {@code q} returns the full list unchanged. Paginated
     * (9.2.1) — {@code page} is 1-based and defaults to 1.
     */
    @Transactional(readOnly = true)
    public Page<PromptSummary> listPrompts(UUID userId, String q, Integer page) {
        Slice<Version> current = StringUtils.hasText(q)
                ? versions.searchCurrentVersionsByUser(userId, q.trim(), Pagination.of(page))
                : versions.findCurrentVersionsByUser(userId, Pagination.of(page));
        List<PromptSummary> items = current.getContent().stream()
                .map(v -> new PromptSummary(
                        v.getPromptId(), v.getName(), v.getDescription(), v.getNumber(), v.getCreatedAt()))
                .toList();
        return new Page<>(items, current.hasNext());
    }

    /**
     * The caller's prompt with its Version history (descending, current flagged);
     * cross-user or Trashed (ADR-0004) -> 404.
     */
    @Transactional(readOnly = true)
    public PromptDetail getPrompt(UUID userId, UUID promptId) {
        prompts.findByIdAndUserIdAndDeletedAtIsNull(promptId, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Prompt not found"));
        List<Version> history = versions.findByPromptIdOrderByNumberDesc(promptId);
        int currentNumber = history.isEmpty() ? 0 : history.getFirst().getNumber();
        List<VersionSummary> summaries = history.stream()
                .map(v -> new VersionSummary(
                        v.getId(), v.getNumber(), v.getName(), v.getCreatedAt(), v.getNumber() == currentNumber))
                .toList();
        return new PromptDetail(promptId, summaries);
    }

    /**
     * Full frozen content of a specific Version of the caller's prompt;
     * cross-user or Trashed (ADR-0004) -> 404.
     */
    @Transactional(readOnly = true)
    public Version getVersion(UUID userId, UUID promptId, int number) {
        prompts.findByIdAndUserIdAndDeletedAtIsNull(promptId, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Prompt not found"));
        return versions.findByPromptIdAndNumber(promptId, number)
                .orElseThrow(() -> new ResourceNotFoundException("Version not found"));
    }

    /**
     * Moves the caller's prompt to Trash (ADR-0004). Owner-scoped; unconditional
     * even with an in_progress Run against it. Calling this again on an
     * already-deleted prompt is a no-error no-op (idempotent-if-already-deleted).
     */
    @Transactional
    public void deletePrompt(UUID userId, UUID promptId) {
        Prompt prompt = prompts.findByIdAndUserId(promptId, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Prompt not found"));
        prompt.markDeleted();
    }

    /**
     * Restores the caller's prompt out of Trash. Only reachable for a prompt
     * currently in Trash — restoring a never-deleted or already-active prompt
     * 404s, matching the existing owner-scoped 404 convention used everywhere
     * else (ADR-0004 leaves this choice open; documented here as the pick).
     */
    @Transactional
    public void restorePrompt(UUID userId, UUID promptId) {
        Prompt prompt = prompts.findByIdAndUserIdAndDeletedAtIsNotNull(promptId, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Prompt not found"));
        prompt.restore();
    }

    /** The caller's Trashed prompts: identity, current-version name, and when each was deleted. */
    @Transactional(readOnly = true)
    public List<TrashedPromptSummary> listTrash(UUID userId) {
        return prompts.findByUserIdAndDeletedAtIsNotNullOrderByDeletedAtDesc(userId).stream()
                .map(p -> new TrashedPromptSummary(p.getId(), currentVersionName(p.getId()), p.getDeletedAt()))
                .toList();
    }

    private String currentVersionName(UUID promptId) {
        return versions.findByPromptIdOrderByNumberDesc(promptId).getFirst().getName();
    }

    /**
     * Appends the next Version to an existing prompt. The prompt row is locked
     * (FOR UPDATE) so concurrent appends serialize and numbers never collide.
     */
    Version appendVersion(UUID promptId, VersionRequest request) {
        runSettingsValidator.validate(request);
        List<VariableDeclaration> variables = variableValidator.normalize(request.variables());
        placeholderValidator.validateSetEquality(request.promptText(), variables);
        prompts.findByIdForUpdate(promptId).orElseThrow(() -> new ResourceNotFoundException("Prompt not found"));
        int number = versions.maxNumber(promptId) + 1;
        String systemPrompt = StringUtils.hasText(request.systemPrompt()) ? request.systemPrompt() : null;
        String description = StringUtils.hasText(request.description()) ? request.description() : null;
        Version version = new Version(
                UuidCreator.getTimeOrderedEpoch(),
                promptId,
                number,
                request.name().trim(),
                description,
                request.promptText(),
                request.model(),
                systemPrompt,
                request.maxTokens(),
                request.effort(),
                request.thinking(),
                variables);
        return versions.save(version);
    }
}
