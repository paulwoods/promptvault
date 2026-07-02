package com.promptvault.run;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface RunRepository extends JpaRepository<Run, UUID> {

    Optional<Run> findByIdAndUserId(UUID id, UUID userId);

    List<Run> findByUserIdAndVersionIdOrderByCreatedAtDesc(UUID userId, UUID versionId);

    /** All runs across every Version of a prompt, owner-scoped, newest first. */
    @Query("""
            select r from Run r
            where r.userId = :userId
              and r.versionId in (select v.id from Version v where v.promptId = :promptId)
            order by r.createdAt desc
            """)
    List<Run> findByUserIdAndPromptId(UUID userId, UUID promptId);

    /**
     * All-time token totals grouped by model, filtered directly by the denormalized user_id
     * (no join through version/prompt) so Runs whose Prompt is since trashed still count.
     */
    @Query("""
            select new com.promptvault.run.ModelUsage(
                    r.model,
                    coalesce(sum(r.inputTokens), 0L),
                    coalesce(sum(r.outputTokens), 0L))
            from Run r
            where r.userId = :userId
            group by r.model
            """)
    List<ModelUsage> sumTokensByModel(UUID userId);
}
