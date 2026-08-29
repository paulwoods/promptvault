package com.promptvault.claude;

import com.anthropic.models.messages.MessageCreateParams;
import com.anthropic.models.messages.OutputConfig;
import com.anthropic.models.messages.ThinkingConfigAdaptive;
import com.anthropic.models.messages.ThinkingConfigDisabled;
import com.promptvault.prompt.ModelCapability;
import com.promptvault.prompt.ModelCatalog;
import java.util.Optional;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

/**
 * Maps an SDK-agnostic {@link ClaudeRequest} to the SDK's MessageCreateParams.
 * Effort and thinking are already guaranteed legal for the Prompt's model by
 * {@link com.promptvault.prompt.RunSettingsValidator} at save time, so this
 * class only decides how each reaches the wire: effort is forwarded only for
 * models that accept it at all (Haiku 400s on its presence), and thinking is
 * sent as the model's required form for an always-thinking model (Fable 5
 * rejects a disabled config, so its required adaptive form is sent whatever
 * the stored value) and as the stored value for every other model. The prompt
 * text is sent verbatim as the user message (ADR-0009); the system prompt is
 * sent separately. A Prompt with no prompt text (legal since ADR-0013) is sent
 * as a single period: the API requires at least one message and rejects a text
 * block that is empty <em>or whitespace-only</em>, so a period is the
 * least-said thing it will actually accept.
 */
@Component
public class ClaudeRequestMapper {

    /**
     * What an absent prompt text becomes on the wire. Not a space: the API
     * rejects a whitespace-only text block the same way it rejects an empty
     * one (400, "text content blocks must contain non-whitespace text"), so a
     * space made every such run fail. A period is the least steering thing
     * that clears that bar.
     */
    static final String EMPTY_PROMPT_TEXT = ".";

    private final ModelCatalog catalog;

    public ClaudeRequestMapper(ModelCatalog catalog) {
        this.catalog = catalog;
    }

    public MessageCreateParams toParams(ClaudeRequest request) {
        MessageCreateParams.Builder builder = MessageCreateParams.builder()
                .model(request.model())
                .maxTokens(request.maxTokens())
                // Blank reaches here as null (PromptService normalizes), but
                // the hasText guard makes the substitution true however an
                // empty prompt text arrives.
                .addUserMessage(
                        StringUtils.hasText(request.userMessage()) ? request.userMessage() : EMPTY_PROMPT_TEXT);
        if (request.systemPrompt() != null) {
            builder.system(request.systemPrompt());
        }

        Optional<ModelCapability> capability = catalog.find(request.model());

        if (capability.map(ModelCapability::supportsEffort).orElse(false)) {
            builder.outputConfig(OutputConfig.builder()
                    .effort(OutputConfig.Effort.of(request.effort()))
                    .build());
        }
        if (capability.map(ModelCapability::alwaysThinking).orElse(false)
                || "adaptive".equals(request.thinking())) {
            builder.thinking(ThinkingConfigAdaptive.builder().build());
        } else {
            builder.thinking(ThinkingConfigDisabled.builder().build());
        }
        return builder.build();
    }
}