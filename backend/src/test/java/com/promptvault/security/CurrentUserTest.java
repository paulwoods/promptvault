package com.promptvault.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

class CurrentUserTest {

    private final CurrentUser currentUser = new CurrentUser();

    @AfterEach
    void clearContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void returnsAuthenticatedPrincipalUserId() {
        UUID userId = UUID.randomUUID();
        SecurityContextHolder.getContext()
                .setAuthentication(new UsernamePasswordAuthenticationToken(
                        new AuthPrincipal(userId), null, List.of()));

        assertThat(currentUser.userId()).isEqualTo(userId);
    }

    @Test
    void throwsWhenUnauthenticated() {
        SecurityContextHolder.clearContext();

        assertThatThrownBy(currentUser::userId).isInstanceOf(IllegalStateException.class);
    }
}
