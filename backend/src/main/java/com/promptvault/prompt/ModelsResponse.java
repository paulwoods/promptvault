package com.promptvault.prompt;

import java.util.List;

/** The supported models with their capabilities, and which is the default. */
public record ModelsResponse(List<ModelCapability> models, String defaultModel) {}
