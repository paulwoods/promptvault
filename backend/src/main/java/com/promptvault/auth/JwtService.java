package com.promptvault.auth;

import com.promptvault.security.AuthPrincipal;
import com.promptvault.user.User;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Date;
import java.util.UUID;
import javax.crypto.SecretKey;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

/** Issues HS256 access tokens. Token validation/parsing is added with the auth filter (2.3). */
@Service
public class JwtService {

    private static final Duration TOKEN_TTL = Duration.ofHours(24);

    private final SecretKey key;

    public JwtService(JwtProperties properties) {
        if (!StringUtils.hasText(properties.secret())) {
            throw new IllegalStateException("PROMPTVAULT_JWT_SECRET must be set");
        }
        this.key = Keys.hmacShaKeyFor(properties.secret().getBytes(StandardCharsets.UTF_8));
    }

    public String issue(User user) {
        Instant now = Instant.now();
        return Jwts.builder()
                .subject(user.getId().toString())
                .claim("email", user.getEmail())
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plus(TOKEN_TTL)))
                .signWith(key, Jwts.SIG.HS256)
                .compact();
    }

    /** Verifies the token's signature and expiry and resolves the principal from its claims. */
    public AuthPrincipal parse(String token) {
        Claims claims =
                Jwts.parser().verifyWith(key).build().parseSignedClaims(token).getPayload();
        return new AuthPrincipal(UUID.fromString(claims.getSubject()), claims.get("email", String.class));
    }
}
