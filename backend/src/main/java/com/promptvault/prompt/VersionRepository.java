package com.promptvault.prompt;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Slice;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface VersionRepository extends JpaRepository<Version, UUID> {

    @Query("select coalesce(max(v.number), 0) from Version v where v.promptId = :promptId")
    int maxNumber(UUID promptId);

    List<Version> findByPromptIdOrderByNumberDesc(UUID promptId);

    /**
     * The current (max-number) Version of each of the given prompts — Trash
     * listing resolves every name in one query instead of one per prompt.
     * Caller ensures {@code promptIds} is non-empty.
     */
    @Query("""
            select v from Version v
            where v.promptId in :promptIds
              and v.number = (select max(v2.number) from Version v2 where v2.promptId = v.promptId)
            """)
    List<Version> findCurrentVersionsByPromptIds(Collection<UUID> promptIds);

    Optional<Version> findByPromptIdAndNumber(UUID promptId, int number);

    /**
     * The current (max-number) Version of each active (not-Trashed) prompt owned
     * by the user, newest prompt first. Paginated (9.2.1, offset-based) — a
     * {@code Slice} fetches one extra row to report {@code hasNext} with no
     * {@code COUNT(*)} query.
     */
    @Query("""
            select v from Version v
            where v.promptId in (select p.id from Prompt p where p.userId = :userId and p.deletedAt is null)
              and v.number = (select max(v2.number) from Version v2 where v2.promptId = v.promptId)
            order by v.createdAt desc
            """)
    Slice<Version> findCurrentVersionsByUser(UUID userId, Pageable pageable);

    /**
     * Same as {@link #findCurrentVersionsByUser}, restricted to prompts whose
     * current Version's name or description contains {@code q} (case-insensitive
     * substring — ILIKE semantics, 9.1.1). Caller ensures {@code q} is non-blank
     * and pre-escaped with {@code !} so LIKE wildcards match literally.
     * Paginated (9.2.1) the same way.
     */
    @Query("""
            select v from Version v
            where v.promptId in (select p.id from Prompt p where p.userId = :userId and p.deletedAt is null)
              and v.number = (select max(v2.number) from Version v2 where v2.promptId = v.promptId)
              and (lower(v.name) like lower(concat('%', :q, '%')) escape '!'
                   or lower(v.description) like lower(concat('%', :q, '%')) escape '!')
            order by v.createdAt desc
            """)
    Slice<Version> searchCurrentVersionsByUser(UUID userId, String q, Pageable pageable);
}
