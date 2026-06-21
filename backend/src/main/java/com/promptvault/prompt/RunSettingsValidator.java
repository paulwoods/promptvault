package com.promptvault.prompt;

import com.promptvault.error.DomainValidationException;
import java.util.Set;
import org.springframework.stereotype.Component;

/**
 * Validates the Run Settings against the model -> capabilities map: the model
 * must be supported, effort/thinking must be valid enums, and a Version may not
 * select a capability its model lacks (adaptive thinking on e.g. Haiku). Effort
 * is stored on every Version regardless of model (only forwarding is per-model).
 * The max_tokens range is enforced by Bean Validation on the request.
 */
@Component
public class RunSettingsValidator {

    static final Set<String> EFFORT_VALUES = Set.of("low", "medium", "high");
    static final Set<String> THINKING_VALUES = Set.of("off", "adaptive");

    private final ModelCatalog catalog;

    public RunSettingsValidator(ModelCatalog catalog) {
        this.catalog = catalog;
    }

    public void validate(VersionRequest request) {
        ModelCapability capability = catalog.find(request.model())
                .orElseThrow(() -> new DomainValidationException("model", "Unsupported model: " + request.model()));
        if (!EFFORT_VALUES.contains(request.effort())) {
            throw new DomainValidationException("effort", "Invalid effort: " + request.effort());
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
