package com.promptvault.prompt;

import com.github.f4b6a3.uuid.UuidCreator;
import com.promptvault.error.ResourceNotFoundException;
import java.util.List;
import java.util.UUID;
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
     * Cross-user access is not found (404).
     */
    @Transactional
    public Version addVersion(UUID userId, UUID promptId, VersionRequest request) {
        if (prompts.findByIdAndUserId(promptId, userId).isEmpty()) {
            throw new ResourceNotFoundException("Prompt not found");
        }
        return appendVersion(promptId, request);
    }

    /** Lists the caller's prompts, each summarized by its current Version. */
    @Transactional(readOnly = true)
    public List<PromptSummary> listPrompts(UUID userId) {
        return versions.findCurrentVersionsByUser(userId).stream()
                .map(v -> new PromptSummary(
                        v.getPromptId(), v.getName(), v.getDescription(), v.getNumber(), v.getCreatedAt()))
                .toList();
    }

    /** The caller's prompt with its Version history (descending, current flagged); cross-user -> 404. */
    @Transactional(readOnly = true)
    public PromptDetail getPrompt(UUID userId, UUID promptId) {
        prompts.findByIdAndUserId(promptId, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Prompt not found"));
        List<Version> history = versions.findByPromptIdOrderByNumberDesc(promptId);
        int currentNumber = history.isEmpty() ? 0 : history.getFirst().getNumber();
        List<VersionSummary> summaries = history.stream()
                .map(v -> new VersionSummary(
                        v.getId(), v.getNumber(), v.getName(), v.getCreatedAt(), v.getNumber() == currentNumber))
                .toList();
        return new PromptDetail(promptId, summaries);
    }

    /** Full frozen content of a specific Version of the caller's prompt; cross-user -> 404. */
    @Transactional(readOnly = true)
    public Version getVersion(UUID userId, UUID promptId, int number) {
        prompts.findByIdAndUserId(promptId, userId)
                .orElseThrow(() -> new ResourceNotFoundException("Prompt not found"));
        return versions.findByPromptIdAndNumber(promptId, number)
                .orElseThrow(() -> new ResourceNotFoundException("Version not found"));
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
