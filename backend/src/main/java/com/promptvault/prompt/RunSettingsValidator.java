package com.promptvault.prompt;

import com.promptvault.error.DomainValidationException;
import java.util.Set;
import org.springframework.stereotype.Component;

/**
 * The single seam that decides whether a Prompt's Run Settings are legal: the
 * model must be supported, effort must be one of that model's levels, and
 * thinking must be a valid enum that the model is not asked to do adaptively
 * if it cannot (e.g. Haiku). An always-thinking model (Fable 5) accepts both
 * stored thinking values — the run sends its required form either way.
 * Effort is stored on every Prompt regardless of model (only forwarding is
 * per-model, decided later by ClaudeRequestMapper). Once a Prompt is saved,
 * its settings are trusted as legal everywhere downstream.
 * The max_tokens range is enforced by Bean Validation on the request.
 */
@Component
public class RunSettingsValidator {

    static final Set<String> THINKING_VALUES = Set.of("off", "adaptive");

    private final ModelCatalog catalog;

    public RunSettingsValidator(ModelCatalog catalog) {
        this.catalog = catalog;
    }

    public void validate(PromptRequest request) {
        ModelCapability capability = catalog.find(request.model())
                .orElseThrow(() -> new DomainValidationException("model", "Unsupported model: " + request.model()));
        if (!capability.effortLevels().contains(request.effort())) {
            throw new DomainValidationException(
                    "effort", "Invalid effort for model " + request.model() + ": " + request.effort());
        }
        if (!THINKING_VALUES.contains(request.thinking())) {
            throw new DomainValidationException("thinking", "Invalid thinking: " + request.thinking());
        }
        if ("adaptive".equals(request.thinking()) && !capability.supportsAdaptiveThinking()) {
            throw new DomainValidationException(
                    "thinking", "Model " + request.model() + " does not support adaptive thinking");
        }
    }
}