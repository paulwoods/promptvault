package com.promptvault.prompt;

import jakarta.persistence.LockModeType;
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

    Optional<Prompt> findByIdAndUserId(UUID id, UUID userId);
}
