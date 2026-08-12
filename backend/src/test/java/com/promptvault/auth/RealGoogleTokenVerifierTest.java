package com.promptvault.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jose.jwk.gen.RSAKeyGenerator;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import com.promptvault.error.InvalidCredentialsException;
import com.sun.net.httpserver.HttpServer;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import java.util.function.Consumer;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

/**
 * The real verifier is tested where {@code RealClaudeClient} is not: a vendor
 * adapter that fails open here is an authentication bypass, and every other
 * test in the suite drives {@link FakeGoogleTokenVerifier} instead. Tokens are
 * signed with a throwaway key and served from a loopback JWK Set, so the
 * signature, issuer, audience, and expiry checks are all exercised with no
 * network and no Google.
 */
class RealGoogleTokenVerifierTest {

    private static final String CLIENT_ID = "test-client-id.apps.googleusercontent.com";
    private static final String GOOGLE_SUB = "109876543210987654321";

    private static HttpServer jwkSetServer;
    private static RSAKey signingKey;
    private static RSAKey foreignKey;
    private static RealGoogleTokenVerifier verifier;

    @BeforeAll
    static void publishJwkSet() throws Exception {
        signingKey = new RSAKeyGenerator(2048).keyID("published").generate();
        foreignKey = new RSAKeyGenerator(2048).keyID("unpublished").generate();

        byte[] jwkSet = new JWKSet(signingKey.toPublicJWK()).toString().getBytes(StandardCharsets.UTF_8);
        jwkSetServer = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        jwkSetServer.createContext("/jwks", exchange -> {
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, jwkSet.length);
            try (OutputStream body = exchange.getResponseBody()) {
                body.write(jwkSet);
            }
        });
        jwkSetServer.start();

        String jwkSetUri = "http://127.0.0.1:" + jwkSetServer.getAddress().getPort() + "/jwks";
        verifier = new RealGoogleTokenVerifier(CLIENT_ID, jwkSetUri);
    }

    @AfterAll
    static void stopJwkSetServer() {
        jwkSetServer.stop(0);
    }

    @Test
    void acceptsAGenuineToken() throws Exception {
        GoogleIdentity identity = verifier.verify(token(claims -> {}));

        assertThat(identity)
                .isEqualTo(new GoogleIdentity(GOOGLE_SUB, "user@example.com", true, "Ada Lovelace"));
    }

    /** Google issues both spellings of its issuer; rejecting either would break sign-in at random. */
    @Test
    void acceptsBothSpellingsOfGooglesIssuer() throws Exception {
        assertThat(verifier.verify(token(claims -> claims.issuer("accounts.google.com"))))
                .isNotNull();
        assertThat(verifier.verify(token(claims -> claims.issuer("https://accounts.google.com"))))
                .isNotNull();
    }

    @Test
    void reportsAnUnverifiedEmailRatherThanHidingIt() throws Exception {
        GoogleIdentity identity = verifier.verify(token(claims -> claims.claim("email_verified", false)));

        assertThat(identity.emailVerified()).isFalse();
    }

    @Test
    void toleratesAMissingNameClaim() throws Exception {
        GoogleIdentity identity = verifier.verify(token(claims -> claims.claim("name", null)));

        assertThat(identity.name()).isNull();
        assertThat(identity.sub()).isEqualTo(GOOGLE_SUB);
    }

    @Test
    void rejectsATokenSignedByAnUnpublishedKey() throws Exception {
        String forged = signedWith(foreignKey, claimsFor(claims -> {}));

        assertThatThrownBy(() -> verifier.verify(forged)).isInstanceOf(InvalidCredentialsException.class);
    }

    @Test
    void rejectsATokenIssuedToAnotherClient() throws Exception {
        String other = token(claims -> claims.audience("someone-else.apps.googleusercontent.com"));

        assertThatThrownBy(() -> verifier.verify(other)).isInstanceOf(InvalidCredentialsException.class);
    }

    @Test
    void rejectsATokenWithNoAudience() throws Exception {
        String audienceless = token(claims -> claims.audience((String) null));

        assertThatThrownBy(() -> verifier.verify(audienceless)).isInstanceOf(InvalidCredentialsException.class);
    }

    @Test
    void rejectsATokenFromAnotherIssuer() throws Exception {
        String impostor = token(claims -> claims.issuer("https://accounts.google.com.evil.example"));

        assertThatThrownBy(() -> verifier.verify(impostor)).isInstanceOf(InvalidCredentialsException.class);
    }

    @Test
    void rejectsAnExpiredToken() throws Exception {
        // Well past JwtTimestampValidator's default 60s clock skew.
        String expired = token(claims -> claims.expirationTime(Date.from(Instant.now().minusSeconds(600))));

        assertThatThrownBy(() -> verifier.verify(expired)).isInstanceOf(InvalidCredentialsException.class);
    }

    @Test
    void rejectsSomethingThatIsNotAToken() {
        assertThatThrownBy(() -> verifier.verify("not-a-jwt")).isInstanceOf(InvalidCredentialsException.class);
    }

    /** A token Google would have issued, with the given claims overridden. */
    private static String token(Consumer<JWTClaimsSet.Builder> overrides) throws Exception {
        return signedWith(signingKey, claimsFor(overrides));
    }

    private static JWTClaimsSet claimsFor(Consumer<JWTClaimsSet.Builder> overrides) {
        Instant now = Instant.now();
        JWTClaimsSet.Builder claims = new JWTClaimsSet.Builder()
                .issuer("https://accounts.google.com")
                .audience(CLIENT_ID)
                .subject(GOOGLE_SUB)
                .claim("email", "user@example.com")
                .claim("email_verified", true)
                .claim("name", "Ada Lovelace")
                .issueTime(Date.from(now))
                .expirationTime(Date.from(now.plusSeconds(600)));
        overrides.accept(claims);
        return claims.build();
    }

    private static String signedWith(RSAKey key, JWTClaimsSet claims) throws Exception {
        SignedJWT jwt = new SignedJWT(
                new JWSHeader.Builder(JWSAlgorithm.RS256).keyID(key.getKeyID()).build(), claims);
        jwt.sign(new RSASSASigner(key));
        return jwt.serialize();
    }
}
