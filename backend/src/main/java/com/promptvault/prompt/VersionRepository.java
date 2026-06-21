package com.promptvault.prompt;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface VersionRepository extends JpaRepository<Version, UUID> {

    @Query("select coalesce(max(v.number), 0) from Version v where v.promptId = :promptId")
    int maxNumber(UUID promptId);

    List<Version> findByPromptIdOrderByNumberDesc(UUID promptId);

    Optional<Version> findByPromptIdAndNumber(UUID promptId, int number);

    /** The current (max-number) Version of each prompt owned by the user, newest prompt first. */
    @Query("""
            select v from Version v
            where v.promptId in (select p.id from Prompt p where p.userId = :userId)
              and v.number = (select max(v2.number) from Version v2 where v2.promptId = v.promptId)
            order by v.createdAt desc
            """)
    List<Version> findCurrentVersionsByUser(UUID userId);
}
