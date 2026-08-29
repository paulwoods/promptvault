package com.promptvault.prompt;

import java.util.List;

/**
 * A supported model and which Run Settings it supports. The booleans describe
 * what reaches the API: Haiku forwards neither effort (it 400s on it) nor
 * thinking; Fable 5 always thinks, so its stored setting goes unforwarded as
 * a choice — the run sends its required adaptive form either way.
 * {@code effortLevels} bounds the stored effort per model, including on
 * models that never forward it — the set of values a Prompt may carry.
 */
public record ModelCapability(
        String id,
        boolean supportsEffort,
        List<String> effortLevels,
        boolean supportsAdaptiveThinking,
        boolean alwaysThinking) {}