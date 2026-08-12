package com.promptvault.auth;

import static org.hamcrest.Matchers.matchesPattern;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import com.promptvault.IntegrationTest;
import com.promptvault.error.InvalidCredentialsException;
import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

/**
 * Google sign-in through the HTTP front door, with the verification seam faked
 * so these tests are about account resolution (ADR-0011) rather than
 * cryptography — {@link RealGoogleTokenVerifierTest} covers the token itself.
 */
@Import(GoogleLoginTest.FakeVerifierConfig.class)
@TestPropertySource(properties = "promptvault.google.client-id=test-client-id.apps.googleusercontent.com")
class GoogleLoginTest extends IntegrationTest {

    @TestConfiguration
    static class FakeVerifierConfig {

        @Bean
        @Primary
        FakeGoogleTokenVerifier fakeGoogleTokenVerifier() {
            return new FakeGoogleTokenVerifier();
        }
    }

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private FakeGoogleTokenVerifier verifier;

    private ResultActions signIn() throws Exception {
        return mockMvc.perform(post("/api/auth/google")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"idToken\":\"an-id-token\"}"));
    }

    /** Signs in and returns the access token. */
    private String signInSuccessfully() throws Exception {
        String response = signIn()
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString();
        return JsonPath.read(response, "$.token");
    }

    private String userIdOf(String token) throws Exception {
        String response = mockMvc.perform(get("/api/me").header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString();
        return JsonPath.read(response, "$.id");
    }

    @Test
    void firstSignInProvisionsAUserAndReturnsAToken() throws Exception {
        verifier.respondWith(new GoogleIdentity("sub-new", "new@example.com", true, "Ada Lovelace"));

        String token = signInSuccessfully();

        Assertions.assertThat(token).matches("[^.]+\\.[^.]+\\.[^.]+");
        mockMvc.perform(get("/api/me").header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
                .andExpect(jsonPath("$.email").value("new@example.com"))
                .andExpect(jsonPath("$.name").value("Ada Lovelace"));
    }

    @Test
    void aMissingNameClaimFallsBackToTheEmail() throws Exception {
        verifier.respondWith(new GoogleIdentity("sub-nameless", "nameless@example.com", true, null));

        String token = signInSuccessfully();

        mockMvc.perform(get("/api/me").header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
                .andExpect(jsonPath("$.name").value("nameless@example.com"));
    }

    /**
     * The subject is the account key. An email change at Google must find the
     * same User, and must not rewrite the stored email (ADR-0011).
     */
    @Test
    void returningUserIsFoundBySubjectEvenAfterTheirEmailChangesAtGoogle() throws Exception {
        verifier.respondWith(new GoogleIdentity("sub-stable", "before@example.com", true, "Ada"));
        String first = signInSuccessfully();

        verifier.respondWith(new GoogleIdentity("sub-stable", "after@example.com", true, "Ada"));
        String second = signInSuccessfully();

        Assertions.assertThat(userIdOf(second)).isEqualTo(userIdOf(first));
        mockMvc.perform(get("/api/me").header(HttpHeaders.AUTHORIZATION, "Bearer " + second))
                .andExpect(jsonPath("$.email").value("before@example.com"));
    }

    @Test
    void verifiedEmailLinksGoogleOntoTheExistingPasswordAccount() throws Exception {
        String passwordToken = registerAndLogin("linked@example.com");
        // Case-variant, because email matching is case-insensitive.
        verifier.respondWith(new GoogleIdentity("sub-linked", "Linked@Example.com", true, "Linked"));

        String googleToken = signInSuccessfully();

        Assertions.assertThat(userIdOf(googleToken)).isEqualTo(userIdOf(passwordToken));
    }

    @Test
    void linkingLeavesThePasswordWorking() throws Exception {
        registerAndLogin("both@example.com");
        verifier.respondWith(new GoogleIdentity("sub-both", "both@example.com", true, "Both"));
        signInSuccessfully();

        login("both@example.com", "password123").andExpect(status().isOk());
    }

    @Test
    void anUnverifiedEmailIsRefused() throws Exception {
        verifier.respondWith(new GoogleIdentity("sub-unverified", "unverified@example.com", false, "Nope"));

        signIn().andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("unauthorized"))
                .andExpect(jsonPath("$.message").value("Google sign-in failed"));
    }

    @Test
    void aRejectedTokenIsAGeneric401() throws Exception {
        verifier.failWith(new InvalidCredentialsException("Google sign-in failed"));

        signIn().andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("unauthorized"));
    }

    /** A Google-only User has no password; the API must not reveal that. */
    @Test
    void passwordLoginForAGoogleOnlyUserGetsTheOrdinaryFailure() throws Exception {
        verifier.respondWith(new GoogleIdentity("sub-google-only", "googleonly@example.com", true, "G"));
        signInSuccessfully();

        login("googleonly@example.com", "password123")
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("unauthorized"))
                .andExpect(jsonPath("$.message").value("Invalid email or password"));
    }

    @Test
    void aBlankIdTokenIsARejectedRequest() throws Exception {
        mockMvc.perform(post("/api/auth/google")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"idToken\":\"\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("validation_error"));
    }

    @Test
    void theIdTokenReachesTheSeamVerbatim() throws Exception {
        verifier.respondWith(new GoogleIdentity("sub-verbatim", "verbatim@example.com", true, "V"));

        signInSuccessfully();

        Assertions.assertThat(verifier.capturedIdToken()).isEqualTo("an-id-token");
    }

    @Test
    void configExposesTheConfiguredClientId() throws Exception {
        mockMvc.perform(get("/api/auth/config"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.googleClientId").value("test-client-id.apps.googleusercontent.com"));
    }

    @Test
    void theTokenIsAnOrdinaryAccessToken() throws Exception {
        verifier.respondWith(new GoogleIdentity("sub-ordinary", "ordinary@example.com", true, "O"));

        String token = signInSuccessfully();

        // Nothing downstream knows which Login Method issued it.
        mockMvc.perform(get("/api/prompts").header(HttpHeaders.AUTHORIZATION, "Bearer " + token))
                .andExpect(status().isOk());
    }

    @Test
    void googleSignInIsPublic() throws Exception {
        verifier.respondWith(new GoogleIdentity("sub-public", "public@example.com", true, "P"));

        // No Authorization header anywhere in these tests; asserted explicitly here.
        signIn().andExpect(status().isOk())
                .andExpect(jsonPath("$.token", matchesPattern("[^.]+\\.[^.]+\\.[^.]+")));
    }

    private String registerAndLogin(String email) throws Exception {
        String body = "{\"email\":\"%s\",\"password\":\"password123\"}".formatted(email);
        mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isCreated());
        String response = login(email, "password123")
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString();
        return JsonPath.read(response, "$.token");
    }

    private ResultActions login(String email, String password) throws Exception {
        return mockMvc.perform(post("/api/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"%s\",\"password\":\"%s\"}".formatted(email, password)));
    }
}
