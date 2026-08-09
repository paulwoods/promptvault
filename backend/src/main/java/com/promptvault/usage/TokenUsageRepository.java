package com.promptvault.usage;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface TokenUsageRepository extends JpaRepository<TokenUsage, TokenUsageId> {

    List<TokenUsage> findByUserIdOrderByModel(UUID userId);

    /**
     * Insert-or-increment in one atomic statement, so two runs settling at the
     * same moment on the same model can't lose an increment between them.
     *
     * <p>Clears the persistence context afterwards: this writes behind JPA's
     * back, so a cached {@link TokenUsage} read earlier in the same transaction
     * would otherwise still report the pre-increment totals.
     */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query(
            nativeQuery = true,
            value =
                    """
                    insert into token_usage (user_id, model, input_tokens, output_tokens)
                    values (:userId, :model, :inputTokens, :outputTokens)
                    on conflict (user_id, model) do update
                    set input_tokens  = token_usage.input_tokens + excluded.input_tokens,
                        output_tokens = token_usage.output_tokens + excluded.output_tokens
                    """)
    void addUsage(UUID userId, String model, long inputTokens, long outputTokens);
}
