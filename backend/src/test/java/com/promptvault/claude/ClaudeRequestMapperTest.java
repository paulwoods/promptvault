package com.promptvault.claude;

import static org.assertj.core.api.Assertions.assertThat;

import com.anthropic.models.messages.MessageCreateParams;
import com.anthropic.models.messages.OutputConfig;
import com.promptvault.prompt.ModelCapability;
import com.promptvault.prompt.ModelCatalog;
import java.util.List;
import java.util.Map;
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

    /**
     * The 18.1 contract: anything the save accepts, a run accepts. The
     * validator admits model/effort/thinking combinations the catalog marks
     * legal, so for every catalog model the mapper must reach the wire with
     * that model's legal forms — no disabled thinking config on a model with
     * no off, no effort param on a model that rejects its presence.
     */
    @Test
    void everySavedSettingReachesTheWireAsItsModelRequires() {
        for (ModelCapability capability : new ModelCatalog().all()) {
            for (String thinking : List.of("off", "adaptive")) {
                for (String effort : capability.effortLevels()) {
                    MessageCreateParams params =
                            mapper.toParams(new ClaudeRequest(capability.id(), null, "hi", 256, effort, thinking));

                    if (capability.alwaysThinking()) {
                        assertThat(params.thinking().orElseThrow().isAdaptive())
                                .as("%s always thinks, stored %s", capability.id(), thinking)
                                .isTrue();
                    } else if ("adaptive".equals(thinking)) {
                        assertThat(params.thinking().orElseThrow().isAdaptive())
                                .as("%s with stored %s", capability.id(), thinking)
                                .isTrue();
                    } else {
                        assertThat(params.thinking().orElseThrow().isDisabled())
                                .as("%s with stored %s", capability.id(), thinking)
                                .isTrue();
                    }

                    if (capability.supportsEffort()) {
                        assertThat(params.outputConfig()).as("%s effort %s", capability.id(), effort).isPresent();
                    } else {
                        assertThat(params.outputConfig()).as("%s effort %s", capability.id(), effort).isEmpty();
                    }
                }
            }
        }
    }

    @Test
    void fableForwardsTheExtendedEffortLevels() {
        Map<String, OutputConfig.Effort> expected = Map.of(
                "low", OutputConfig.Effort.LOW,
                "medium", OutputConfig.Effort.MEDIUM,
                "high", OutputConfig.Effort.HIGH,
                "xhigh", OutputConfig.Effort.XHIGH,
                "max", OutputConfig.Effort.MAX);
        for (Map.Entry<String, OutputConfig.Effort> level : expected.entrySet()) {
            MessageCreateParams params =
                    mapper.toParams(new ClaudeRequest("claude-fable-5", null, "hi", 256, level.getKey(), "off"));

            assertThat(params.outputConfig()).isPresent();
            assertThat(params.outputConfig().orElseThrow().effort())
                    .contains(level.getValue());
        }
    }
}