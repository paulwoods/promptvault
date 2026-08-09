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
    private final RunSettingsValidator runSettingsValidator;
    private final VariableValidator variableValidator;
    private final PlaceholderValidator placeholderValidator;

    public PromptService(
            PromptRepository prompts,
            RunSettingsValidator runSettingsValidator,
            VariableValidator variableValidator,
            PlaceholderValidator placeholderValidator) {
        this.prompts = prompts;
        this.runSettingsValidator = runSettingsValidator;
        this.variableValidator = variableValidator;
        this.placeholderValidator = placeholderValidator;
    }

    /** Creates a Prompt from the full content. */
    @Transactional
    public Prompt createPrompt(UUID userId, PromptRequest request) {
        Validated validated = validate(request);
        Prompt prompt = new Prompt(
                UuidCreator.getTimeOrderedEpoch(),
                userId,
                validated.name(),
                validated.description(),
                request.promptText(),
                request.model(),
                validated.systemPrompt(),
                request.maxTokens(),
                request.effort(),
                request.thinking(),
                validated.variables());
        return prompts.save(prompt);
    }

    /**
     * Overwrites the caller's prompt with the full content (covers edit and
     * rename). The previous content is not recoverable (ADR-0007). Concurrent
     * saves are last-write-wins. Cross-user or Trashed (ADR-0004) -> 404.
     */
    @Transactional
    public Prompt updatePrompt(UUID userId, UUID promptId, PromptRequest request) {
        Prompt prompt = prompts.findByIdAndUserIdAndDeletedAtIsNull(promptId, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Prompt not found"));
        Validated validated = validate(request);
        prompt.update(
                validated.name(),
                validated.description(),
                request.promptText(),
                request.model(),
                validated.systemPrompt(),
                request.maxTokens(),
                request.effort(),
                request.thinking(),
                validated.variables());
        return prompt;
    }

    /**
     * Lists the caller's prompts, most recently updated first. When {@code q} is
     * non-blank, restricts to prompts whose name or description contains it
     * (case-insensitive substring, 9.1.1); omitted/blank {@code q} returns the
     * full list unchanged. Paginated (9.2.1) — {@code page} is 1-based and
     * defaults to 1.
     */
    @Transactional(readOnly = true)
    public Page<PromptSummary> listPrompts(UUID userId, String q, Integer page) {
        Slice<Prompt> found = StringUtils.hasText(q)
                ? prompts.search(userId, escapeLike(q.trim()), Pagination.of(page))
                : prompts.findByUserIdAndDeletedAtIsNullOrderByUpdatedAtDesc(userId, Pagination.of(page));
        List<PromptSummary> items = found.getContent().stream()
                .map(p -> new PromptSummary(
                        p.getId(), p.getName(), p.getDescription(), p.getCreatedAt(), p.getUpdatedAt()))
                .toList();
        return new Page<>(items, found.hasNext());
    }

    /** Escapes LIKE wildcards so a search for e.g. "100%" matches the literal text (query uses escape '!'). */
    private static String escapeLike(String q) {
        return q.replace("!", "!!").replace("%", "!%").replace("_", "!_");
    }

    /** The caller's prompt; cross-user or Trashed (ADR-0004) -> 404. */
    @Transactional(readOnly = true)
    public Prompt getPrompt(UUID userId, UUID promptId) {
        return prompts.findByIdAndUserIdAndDeletedAtIsNull(promptId, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Prompt not found"));
    }

    /**
     * Moves the caller's prompt to Trash (ADR-0004). Owner-scoped; unconditional
     * even with a run streaming against it. Calling this again on an
     * already-deleted prompt is a no-error no-op (idempotent-if-already-deleted).
     */
    @Transactional
    public void deletePrompt(UUID userId, UUID promptId) {
        prompts.findByIdAndUserId(promptId, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Prompt not found"))
                .markDeleted();
    }

    /**
     * Restores the caller's prompt out of Trash. Only reachable for a prompt
     * currently in Trash — restoring a never-deleted or already-active prompt
     * 404s, matching the existing owner-scoped 404 convention used everywhere
     * else.
     */
    @Transactional
    public void restorePrompt(UUID userId, UUID promptId) {
        prompts.findByIdAndUserIdAndDeletedAtIsNotNull(promptId, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Prompt not found"))
                .restore();
    }

    /** The caller's Trashed prompts: identity, name, and when each was deleted. */
    @Transactional(readOnly = true)
    public List<TrashedPromptSummary> listTrash(UUID userId) {
        return prompts.findByUserIdAndDeletedAtIsNotNullOrderByDeletedAtDesc(userId).stream()
                .map(p -> new TrashedPromptSummary(p.getId(), p.getName(), p.getDeletedAt()))
                .toList();
    }

    /** Run Settings, Variable, and placeholder validation, plus blank-to-null normalization. */
    private Validated validate(PromptRequest request) {
        runSettingsValidator.validate(request);
        List<VariableDeclaration> variables = variableValidator.normalize(request.variables());
        placeholderValidator.validateSetEquality(request.promptText(), variables);
        return new Validated(
                request.name().trim(),
                StringUtils.hasText(request.description()) ? request.description() : null,
                StringUtils.hasText(request.systemPrompt()) ? request.systemPrompt() : null,
                variables);
    }

    private record Validated(
            String name, String description, String systemPrompt, List<VariableDeclaration> variables) {}
}
