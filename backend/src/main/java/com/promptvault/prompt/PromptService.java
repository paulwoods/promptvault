package com.promptvault.prompt;

import com.github.f4b6a3.uuid.UuidCreator;
import com.promptvault.common.Page;
import com.promptvault.common.Pagination;
import com.promptvault.error.DomainValidationException;
import com.promptvault.error.ResourceNotFoundException;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validator;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.data.domain.Slice;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
public class PromptService {

    private final PromptRepository prompts;
    private final RunSettingsValidator runSettingsValidator;
    private final Validator validator;

    public PromptService(
            PromptRepository prompts,
            RunSettingsValidator runSettingsValidator,
            Validator validator) {
        this.prompts = prompts;
        this.runSettingsValidator = runSettingsValidator;
        this.validator = validator;
    }

    /** Creates a Prompt from the full content, through the same two validation passes a patch crosses. */
    @Transactional
    public Prompt createPrompt(UUID userId, PromptRequest request) {
        requireMechanicallyValid(request);
        Validated validated = validate(request);
        Prompt prompt = new Prompt(
                UuidCreator.getTimeOrderedEpoch(),
                userId,
                validated.name(),
                validated.description(),
                validated.promptText(),
                request.model(),
                validated.systemPrompt(),
                request.maxTokens(),
                request.effort(),
                request.thinking());
        return prompts.save(prompt);
    }

    /**
     * Applies a partial edit to the caller's prompt. Supplied fields are laid
     * over the stored content and the merged result goes through exactly the
     * same validation and overwrite a create gets — a patch cannot produce a
     * Prompt a full save could not. Omitted fields are untouched;
     * ADR-0007 still applies to whatever the patch does change. Cross-user or
     * Trashed (ADR-0004) -> 404.
     */
    @Transactional
    public Prompt patchPrompt(UUID userId, UUID promptId, PromptPatchRequest patch) {
        Prompt prompt = prompts.findByIdAndUserIdAndDeletedAtIsNull(promptId, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Prompt not found"));
        PromptRequest merged = patch.applyTo(prompt);
        requireMechanicallyValid(merged);
        Validated validated = validate(merged);
        prompt.update(
                validated.name(),
                validated.description(),
                validated.promptText(),
                merged.model(),
                validated.systemPrompt(),
                merged.maxTokens(),
                merged.effort(),
                merged.thinking());
        return prompt;
    }

    /**
     * The Bean Validation pass over a complete Prompt — the create body, or a
     * patch merged onto what is stored. It runs here rather than from
     * {@code @Valid} on the controller argument because a patch is only whole
     * once merged, and one call site means create and patch cannot drift
     * (ADR-0014). Every violation is reported, so a request breaking two fields
     * is told about both.
     */
    private void requireMechanicallyValid(PromptRequest content) {
        Set<ConstraintViolation<PromptRequest>> violations = validator.validate(content);
        if (violations.isEmpty()) {
            return;
        }
        Map<String, String> details = violations.stream()
                .sorted(Comparator.comparing(v -> v.getPropertyPath().toString()))
                .collect(Collectors.toMap(
                        v -> v.getPropertyPath().toString(),
                        ConstraintViolation::getMessage,
                        (first, second) -> first,
                        LinkedHashMap::new));
        throw new DomainValidationException(details);
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

    /**
     * Run Settings validation, plus blank-to-null normalization. Both prompt
     * bodies may be empty (ADR-0013); null is how empty is stored, so blank
     * never survives past here.
     */
    private Validated validate(PromptRequest request) {
        runSettingsValidator.validate(request);
        return new Validated(
                request.name().trim(),
                StringUtils.hasText(request.description()) ? request.description() : null,
                StringUtils.hasText(request.promptText()) ? request.promptText() : null,
                StringUtils.hasText(request.systemPrompt()) ? request.systemPrompt() : null);
    }

    private record Validated(String name, String description, String promptText, String systemPrompt) {}
}