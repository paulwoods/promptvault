package com.promptvault.prompt;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Slice;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface PromptRepository extends JpaRepository<Prompt, UUID> {

    /** Owner-scoped, regardless of Trash state — used by delete/restore, which act on either state. */
    Optional<Prompt> findByIdAndUserId(UUID id, UUID userId);

    /** Owner-scoped and active (not in Trash) — used by every normal read (cascade filtering, ADR-0004). */
    Optional<Prompt> findByIdAndUserIdAndDeletedAtIsNull(UUID id, UUID userId);

    /** Owner-scoped and currently in Trash — restore is only reachable from here. */
    Optional<Prompt> findByIdAndUserIdAndDeletedAtIsNotNull(UUID id, UUID userId);

    /** The caller's Trash contents, most recently deleted first. */
    List<Prompt> findByUserIdAndDeletedAtIsNotNullOrderByDeletedAtDesc(UUID userId);

    /**
     * The caller's active (not-Trashed) prompts, most recently updated first.
     * Paginated (9.2.1, offset-based) — a {@code Slice} fetches one extra row to
     * report {@code hasNext} with no {@code COUNT(*)} query.
     */
    Slice<Prompt> findByUserIdAndDeletedAtIsNullOrderByUpdatedAtDesc(UUID userId, Pageable pageable);

    /**
     * Same as {@link #findByUserIdAndDeletedAtIsNullOrderByUpdatedAtDesc},
     * restricted to prompts whose name or description contains {@code q}
     * (case-insensitive substring — ILIKE semantics, 9.1.1). Caller ensures
     * {@code q} is non-blank and pre-escaped with {@code !} so LIKE wildcards
     * match literally.
     */
    @Query("""
            select p from Prompt p
            where p.userId = :userId and p.deletedAt is null
              and (lower(p.name) like lower(concat('%', :q, '%')) escape '!'
                   or lower(p.description) like lower(concat('%', :q, '%')) escape '!')
            order by p.updatedAt desc
            """)
    Slice<Prompt> search(UUID userId, String q, Pageable pageable);
}
