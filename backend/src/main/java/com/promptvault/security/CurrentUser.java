package com.promptvault.security;

import java.util.UUID;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

/**
 * Resolves the current request's authenticated principal. Owned-resource queries
 * filter by {@link #userId()} so another user's rows are simply not found (404),
 * rather than fetched-then-compared.
 */
@Component
public class CurrentUser {

    public AuthPrincipal principal() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !(authentication.getPrincipal() instanceof AuthPrincipal principal)) {
            throw new IllegalStateException("No authenticated principal");
        }
        return principal;
    }

    public UUID userId() {
        return principal().userId();
    }
}
