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
    }

    @Test
    void unknownModelIsNotSupported() {
        assertThat(catalog.find("gpt-5")).isEmpty();
    }
}
