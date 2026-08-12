package com.promptvault.auth;

import com.promptvault.error.InvalidCredentialsException;
import java.util.List;
import java.util.Set;
import java.util.function.Predicate;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2ErrorCodes;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtClaimNames;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.security.oauth2.jwt.JwtTimestampValidator;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;

/**
 * Verifies Google ID tokens against Google's published JWK Set: RS256
 * signature, issuer, audience, and expiry. Every check is mandatory — a
 * verifier that fails open is an authentication bypass, so each rejection is
 * covered by {@code RealGoogleTokenVerifierTest}.
 *
 * <p>The decoder fetches and caches the JWK Set lazily on first use, so
 * constructing this never touches the network.
 */
public class RealGoogleTokenVerifier implements GoogleTokenVerifier {

    /** Google signs ID tokens with both spellings of its issuer; either is legitimate. */
    private static final Set<String> ISSUERS = Set.of("https://accounts.google.com", "accounts.google.com");

    private final JwtDecoder decoder;

    public RealGoogleTokenVerifier(String clientId, String jwkSetUri) {
        NimbusJwtDecoder nimbus = NimbusJwtDecoder.withJwkSetUri(jwkSetUri).build();
        nimbus.setJwtValidator(new DelegatingOAuth2TokenValidator<>(
                new JwtTimestampValidator(),
                require(jwt -> ISSUERS.contains(jwt.getClaimAsString(JwtClaimNames.ISS)), "Unexpected issuer"),
                require(jwt -> audienceOf(jwt).contains(clientId), "Unexpected audience")));
        this.decoder = nimbus;
    }

    @Override
    public GoogleIdentity verify(String idToken) {
        try {
            Jwt jwt = decoder.decode(idToken);
            return new GoogleIdentity(
                    jwt.getSubject(),
                    jwt.getClaimAsString("email"),
                    Boolean.TRUE.equals(jwt.getClaim("email_verified")),
                    jwt.getClaimAsString("name"));
        } catch (JwtException e) {
            // The reason a token failed is a probing oracle; the caller renders
            // the same generic 401 whichever check rejected it.
            throw new InvalidCredentialsException("Google sign-in failed");
        }
    }

    private static OAuth2TokenValidator<Jwt> require(Predicate<Jwt> condition, String description) {
        return jwt -> condition.test(jwt)
                ? OAuth2TokenValidatorResult.success()
                : OAuth2TokenValidatorResult.failure(
                        new OAuth2Error(OAuth2ErrorCodes.INVALID_TOKEN, description, null));
    }

    /** A token with no {@code aud} at all must fail the audience check, not throw. */
    private static List<String> audienceOf(Jwt jwt) {
        List<String> audience = jwt.getAudience();
        return audience == null ? List.of() : audience;
    }
}
