package com.promptvault.run;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Slice;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface RunRepository extends JpaRepository<Run, UUID> {

    Optional<Run> findByIdAndUserId(UUID id, UUID userId);

    /**
     * Same lookup, but cascade-filtered (ADR-0004): a run whose Version belongs
     * to a Trashed Prompt reads as not-found. Reached only via {@code /api/runs/{id}},
     * which — unlike the per-prompt/per-version run listings — has no promptId
     * of its own to check directly, hence the run -> version -> prompt join.
     */
    @Query("""
            select r from Run r
            where r.id = :id
              and r.userId = :userId
              and r.versionId in (
                select v.id from Version v
                where v.promptId in (select p.id from Prompt p where p.deletedAt is null)
              )
            """)
    Optional<Run> findActiveByIdAndUserId(UUID id, UUID userId);

    List<Run> findByUserIdAndVersionIdOrderByCreatedAtDesc(UUID userId, UUID versionId);

    /**
     * Same lookup as {@link #findByUserIdAndVersionIdOrderByCreatedAtDesc}, but
     * filterable by status (9.1.2) and paginated (9.2.2, offset-based) — a null
     * status returns all statuses (today's behavior); a {@code Slice} fetches
     * one extra row to report {@code hasNext} with no {@code COUNT(*)} query.
     */
    @Query("""
            select r from Run r
            where r.userId = :userId
              and r.versionId = :versionId
              and (:status is null or r.status = :status)
            order by r.createdAt desc
            """)
    Slice<Run> findByUserIdAndVersionIdAndStatus(UUID userId, UUID versionId, String status, Pageable pageable);

    /**
     * All runs across every Version of a prompt, owner-scoped, newest first;
     * filterable by status (9.1.2) — a null status returns all statuses
     * (today's behavior) — and paginated (9.2.2) the same way.
     */
    @Query("""
            select r from Run r
            where r.userId = :userId
              and r.versionId in (select v.id from Version v where v.promptId = :promptId)
              and (:status is null or r.status = :status)
            order by r.createdAt desc
            """)
    Slice<Run> findByUserIdAndPromptId(UUID userId, UUID promptId, String status, Pageable pageable);
}
