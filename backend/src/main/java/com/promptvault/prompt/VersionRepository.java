package com.promptvault.prompt;

import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface VersionRepository extends JpaRepository<Version, UUID> {

    @Query("select coalesce(max(v.number), 0) from Version v where v.promptId = :promptId")
    int maxNumber(UUID promptId);
}
