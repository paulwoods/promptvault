package com.promptvault.prompt;

/**
 * A partial edit to a Prompt: every field is optional and an omitted (or null)
 * field leaves the stored value untouched. Clearing an optional field follows
 * the same convention as a full save — send a blank string for
 * {@code description}, {@code promptText}, or {@code systemPrompt} (either
 * prompt body may be empty, ADR-0013).
 *
 * <p>No constraints are declared here: the patch is merged onto the stored
 * Prompt and the <em>merged</em> content is validated with the same rules as
 * {@link PromptRequest}, so a patch cannot leave a Prompt in a state a full
 * save could not have created.
 */
public record PromptPatchRequest(
        String name,
        String description,
        String promptText,
        String model,
        String systemPrompt,
        Integer maxTokens,
        String effort,
        String thinking) {

    /** The stored content with this patch's supplied fields laid over it. */
    PromptRequest applyTo(Prompt prompt) {
        return new PromptRequest(
                name != null ? name : prompt.getName(),
                description != null ? description : prompt.getDescription(),
                promptText != null ? promptText : prompt.getPromptText(),
                model != null ? model : prompt.getModel(),
                systemPrompt != null ? systemPrompt : prompt.getSystemPrompt(),
                maxTokens != null ? maxTokens : prompt.getMaxTokens(),
                effort != null ? effort : prompt.getEffort(),
                thinking != null ? thinking : prompt.getThinking());
    }
}