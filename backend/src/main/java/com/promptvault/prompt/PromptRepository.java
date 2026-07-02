package com.promptvault.prompt;

import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

public interface PromptRepository extends JpaRepository<Prompt, UUID> {

    /** Locks the prompt row (SELECT ... FOR UPDATE) — the version-numbering serialization point. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from Prompt p where p.id = :id")
    Optional<Prompt> findByIdForUpdate(UUID id);

    /** Owner-scoped, regardless of Trash state — used by delete/restore, which act on either state. */
    Optional<Prompt> findByIdAndUserId(UUID id, UUID userId);

    /** Owner-scoped and active (not in Trash) — used by every normal read (cascade filtering, ADR-0004). */
    Optional<Prompt> findByIdAndUserIdAndDeletedAtIsNull(UUID id, UUID userId);

    /** Owner-scoped and currently in Trash — restore is only reachable from here. */
    Optional<Prompt> findByIdAndUserIdAndDeletedAtIsNotNull(UUID id, UUID userId);

    /** The caller's Trash contents, most recently deleted first. */
    List<Prompt> findByUserIdAndDeletedAtIsNotNullOrderByDeletedAtDesc(UUID userId);
}
