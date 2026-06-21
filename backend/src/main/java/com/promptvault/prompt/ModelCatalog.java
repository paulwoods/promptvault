package com.promptvault.prompt;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.stereotype.Component;

/**
 * The backend-maintained model -> capabilities map. Haiku supports neither
 * effort (it 400s on it) nor adaptive thinking; the others support both. The
 * SPA reads this via {@code GET /api/models} to adapt its controls per model.
 */
@Component
public class ModelCatalog {

    public static final String DEFAULT_MODEL = "claude-opus-4-8";

    private static final Map<String, ModelCapability> MODELS = buildModels();

    private static Map<String, ModelCapability> buildModels() {
        Map<String, ModelCapability> models = new LinkedHashMap<>();
        models.put(DEFAULT_MODEL, new ModelCapability(DEFAULT_MODEL, true, true));
        models.put("claude-sonnet-4-6", new ModelCapability("claude-sonnet-4-6", true, true));
        models.put("claude-haiku-4-5", new ModelCapability("claude-haiku-4-5", false, false));
        models.put("claude-fable-5", new ModelCapability("claude-fable-5", true, true));
        return models;
    }

    public Optional<ModelCapability> find(String model) {
        return Optional.ofNullable(MODELS.get(model));
    }

    public List<ModelCapability> all() {
        return List.copyOf(MODELS.values());
    }

    public String defaultModel() {
        return DEFAULT_MODEL;
    }
}
