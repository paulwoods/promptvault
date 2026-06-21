package com.promptvault.prompt;

import com.github.f4b6a3.uuid.UuidCreator;
import com.promptvault.error.ResourceNotFoundException;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
public class PromptService {

    private final PromptRepository prompts;
    private final VersionRepository versions;

    public PromptService(PromptRepository prompts, VersionRepository versions) {
        this.prompts = prompts;
        this.versions = versions;
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

    /**
     * Appends the next Version to an existing prompt. The prompt row is locked
     * (FOR UPDATE) so concurrent appends serialize and numbers never collide.
     */
    Version appendVersion(UUID promptId, VersionRequest request) {
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
                request.thinking());
        return versions.save(version);
    }
}
