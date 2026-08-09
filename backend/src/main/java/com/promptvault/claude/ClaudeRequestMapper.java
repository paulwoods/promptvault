package com.promptvault.claude;

import com.anthropic.models.messages.MessageCreateParams;
import com.anthropic.models.messages.OutputConfig;
import com.anthropic.models.messages.ThinkingConfigAdaptive;
import com.anthropic.models.messages.ThinkingConfigDisabled;
import com.promptvault.prompt.ModelCapability;
import com.promptvault.prompt.ModelCatalog;
import org.springframework.stereotype.Component;

/**
 * Maps an SDK-agnostic {@link ClaudeRequest} to the SDK's MessageCreateParams.
 * Effort and thinking are already guaranteed legal for the Prompt's model by
 * {@link com.promptvault.prompt.RunSettingsValidator} at save time, so this
 * class only decides whether to forward effort (Haiku 400s if it's present at
 * all, regardless of value) and forwards thinking as-is. The prompt text is sent
 * verbatim as the user message (ADR-0009); the system prompt is sent separately.
 */
@Component
public class ClaudeRequestMapper {

    private final ModelCatalog catalog;

    public ClaudeRequestMapper(ModelCatalog catalog) {
        this.catalog = catalog;
    }

    public MessageCreateParams toParams(ClaudeRequest request) {
        MessageCreateParams.Builder builder = MessageCreateParams.builder()
                .model(request.model())
                .maxTokens(request.maxTokens())
                .addUserMessage(request.userMessage());
        if (request.systemPrompt() != null) {
            builder.system(request.systemPrompt());
        }

        boolean supportsEffort = catalog.find(request.model())
                .map(ModelCapability::supportsEffort)
                .orElse(false);

        if (supportsEffort) {
            builder.outputConfig(OutputConfig.builder()
                    .effort(OutputConfig.Effort.of(request.effort()))
                    .build());
        }
        if ("adaptive".equals(request.thinking())) {
            builder.thinking(ThinkingConfigAdaptive.builder().build());
        } else {
            builder.thinking(ThinkingConfigDisabled.builder().build());
        }
        return builder.build();
    }
}
