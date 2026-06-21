package com.promptvault.claude;

import static org.assertj.core.api.Assertions.assertThat;

import com.anthropic.models.messages.MessageCreateParams;
import com.anthropic.models.messages.OutputConfig;
import com.promptvault.prompt.ModelCatalog;
import org.junit.jupiter.api.Test;

/** Contract test for the Run Settings -> SDK params mapping (no network). */
class ClaudeRequestMapperTest {

    private final ClaudeRequestMapper mapper = new ClaudeRequestMapper(new ModelCatalog());

    @Test
    void haikuOmitsEffortAndDisablesThinking() {
        MessageCreateParams params =
                mapper.toParams(new ClaudeRequest("claude-haiku-4-5", "sys", "hi", 100, "medium", "off"));

        assertThat(params.outputConfig()).isEmpty();
        assertThat(params.thinking()).isPresent();
        assertThat(params.thinking().orElseThrow().isDisabled()).isTrue();
    }

    @Test
    void opusForwardsEffortAndAdaptiveThinking() {
        MessageCreateParams params =
                mapper.toParams(new ClaudeRequest("claude-opus-4-8", null, "hi", 256, "high", "adaptive"));

        assertThat(params.maxTokens()).isEqualTo(256);
        assertThat(params.outputConfig()).isPresent();
        assertThat(params.outputConfig().orElseThrow().effort()).contains(OutputConfig.Effort.HIGH);
        assertThat(params.thinking().orElseThrow().isAdaptive()).isTrue();
    }

    @Test
    void adaptiveThinkingDisabledWhenSettingIsOff() {
        MessageCreateParams params =
                mapper.toParams(new ClaudeRequest("claude-opus-4-8", null, "hi", 100, "medium", "off"));

        assertThat(params.thinking().orElseThrow().isDisabled()).isTrue();
    }
}
