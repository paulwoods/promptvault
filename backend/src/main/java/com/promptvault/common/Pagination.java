package com.promptvault.common;

import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;

/**
 * Offset-based pagination (9.2) shared by every "Load more" list: fixed page
 * size, no client-configurable {@code size} param, page 1 is the default.
 */
public final class Pagination {

    public static final int PAGE_SIZE = 20;

    private Pagination() {}

    /** Converts a 1-based {@code page} request param (null/less-than-1 defaults to page 1) into a Pageable. */
    public static Pageable of(Integer page) {
        int zeroBasedPage = (page == null || page < 1) ? 0 : page - 1;
        return PageRequest.of(zeroBasedPage, PAGE_SIZE);
    }
}
