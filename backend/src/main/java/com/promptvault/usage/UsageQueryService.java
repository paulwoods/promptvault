package com.promptvault.usage;

import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class UsageQueryService {

    private final TokenUsageRepository tokenUsage;

    public UsageQueryService(TokenUsageRepository tokenUsage) {
        this.tokenUsage = tokenUsage;
    }

    /** The caller's all-time token totals, one entry per model (ADR-0005). */
    @Transactional(readOnly = true)
    public List<ModelUsage> usage(UUID userId) {
        return tokenUsage.findByUserIdOrderByModel(userId).stream()
                .map(u -> new ModelUsage(u.getModel(), u.getInputTokens(), u.getOutputTokens()))
                .toList();
    }
}
