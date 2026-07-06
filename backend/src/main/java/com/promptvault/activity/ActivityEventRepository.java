package com.promptvault.activity;

import java.util.UUID;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Slice;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface ActivityEventRepository extends JpaRepository<ActivityEvent, UUID> {

    /** The caller's Activity feed, newest first (9.2-style Slice pagination). */
    @Query("select e from ActivityEvent e where e.userId = :userId order by e.occurredAt desc, e.id desc")
    Slice<ActivityEvent> findByUserId(UUID userId, Pageable pageable);
}
