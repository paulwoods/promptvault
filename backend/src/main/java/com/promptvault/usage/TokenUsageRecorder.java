package com.promptvault.usage;

import com.promptvault.claude.Usage;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Adds a completed run's token counts to the User's running totals. This is the
 * whole of what a run leaves behind (ADR-0007) — a failed or disconnected run
 * records nothing, matching the pre-ADR-0007 behaviour where only completed Runs
 * ever carried token counts.
 */
@Service
public class TokenUsageRecorder {

    private final TokenUsageRepository tokenUsage;

    public TokenUsageRecorder(TokenUsageRepository tokenUsage) {
        this.tokenUsage = tokenUsage;
    }

    @Transactional
    public void record(UUID userId, String model, Usage usage) {
        tokenUsage.addUsage(userId, model, usage.inputTokens(), usage.outputTokens());
    }
}
