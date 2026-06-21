package com.promptvault.prompt;

import java.util.List;
import java.util.UUID;

/** A Prompt with its Version history (descending by number, current first). */
public record PromptDetail(UUID promptId, List<VersionSummary> versions) {}
