package com.promptvault.prompt;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/** Confirms the enforced model list and per-model capabilities. */
class ModelCatalogTest {

    private final ModelCatalog catalog = new ModelCatalog();

    @Test
    void exposesExactlyTheFourSupportedModelsWithOpusDefault() {
        assertThat(catalog.all())
                .extracting(ModelCapability::id)
                .containsExactly("claude-opus-4-8", "claude-sonnet-4-6", "claude-haiku-4-5", "claude-fable-5");
        assertThat(catalog.defaultModel()).isEqualTo("claude-opus-4-8");
    }

    @Test
    void haikuLacksEffortAndAdaptiveThinking() {
        ModelCapability haiku = catalog.find("claude-haiku-4-5").orElseThrow();
        assertThat(haiku.supportsEffort()).isFalse();
        assertThat(haiku.supportsAdaptiveThinking()).isFalse();
        assertThat(haiku.alwaysThinking()).isFalse();
    }

    @Test
    void fableIsTheOnlyAlwaysThinkingModelAndTakesTheWiderEffortLevelsWithOpus() {
        ModelCapability fable = catalog.find("claude-fable-5").orElseThrow();
        assertThat(fable.alwaysThinking()).isTrue();
        assertThat(fable.effortLevels())
                .containsExactly("low", "medium", "high", "xhigh", "max");

        ModelCapability opus = catalog.find("claude-opus-4-8").orElseThrow();
        assertThat(opus.alwaysThinking()).isFalse();
        assertThat(opus.effortLevels()).containsExactly("low", "medium", "high", "xhigh", "max");

        ModelCapability sonnet = catalog.find("claude-sonnet-4-6").orElseThrow();
        assertThat(sonnet.effortLevels()).containsExactly("low", "medium", "high");
        ModelCapability haiku = catalog.find("claude-haiku-4-5").orElseThrow();
        assertThat(haiku.effortLevels()).containsExactly("low", "medium", "high");
    }

    @Test
    void everyModelAcceptsTheAppDefaultEffort() {
        // The Console's model-change coercion resets effort to 'medium' when the
        // target model cannot accept the stored value; that rescue value is only
        // safe while every model's levels include it.
        assertThat(catalog.all())
                .allSatisfy(capability -> assertThat(capability.effortLevels()).contains("medium"));
    }

    @Test
    void unknownModelIsNotSupported() {
        assertThat(catalog.find("gpt-5")).isEmpty();
    }
}