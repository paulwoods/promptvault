package com.promptvault.common;

import java.util.List;
import org.springframework.data.domain.Slice;

/**
 * A page of items plus whether more exist after it (9.2) — no total {@code COUNT(*)},
 * "Load more" rather than numbered pages.
 */
public record Page<T>(List<T> items, boolean hasMore) {

    public static <T> Page<T> from(Slice<T> slice) {
        return new Page<>(slice.getContent(), slice.hasNext());
    }
}
