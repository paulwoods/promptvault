package com.promptvault.claude;

import com.anthropic.models.messages.MessageCreateParams;
import com.anthropic.models.messages.OutputConfig;
import com.anthropic.models.messages.ThinkingConfigAdaptive;
import com.anthropic.models.messages.ThinkingConfigDisabled;
import com.promptvault.prompt.ModelCapability;
import com.promptvault.prompt.ModelCatalog;
import java.util.Optional;
import org.springframework.stereotype.Component;

/**
 * Maps an SDK-agnostic {@link ClaudeRequest} to the SDK's MessageCreateParams,
 * reconciling Run Settings with the model -> capabilities map: effort is
 * forwarded only for models that support it, and adaptive thinking only where
 * supported (otherwise thinking is disabled). The rendered prompt is the user
 * message; the system prompt is sent separately.
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

        Optional<ModelCapability> capability = catalog.find(request.model());
        boolean supportsEffort = capability.map(ModelCapability::supportsEffort).orElse(false);
        boolean supportsAdaptiveThinking =
                capability.map(ModelCapability::supportsAdaptiveThinking).orElse(false);

        if (supportsEffort) {
            builder.outputConfig(OutputConfig.builder()
                    .effort(OutputConfig.Effort.of(request.effort()))
                    .build());
        }
        if ("adaptive".equals(request.thinking()) && supportsAdaptiveThinking) {
            builder.thinking(ThinkingConfigAdaptive.builder().build());
        } else {
            builder.thinking(ThinkingConfigDisabled.builder().build());
        }
        return builder.build();
    }
}
