package com.promptvault.common;

import java.util.List;

/**
 * A page of items plus whether more exist after it (9.2) — no total {@code COUNT(*)},
 * "Load more" rather than numbered pages. Callers build it from a repository
 * {@code Slice} by hand.
 */
public record Page<T>(List<T> items, boolean hasMore) {}
