package com.promptvault.apikey;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import com.promptvault.IntegrationTest;
import com.promptvault.crypto.EncryptedPayload;
import com.promptvault.crypto.EncryptionService;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

/**
 * Phase-3 acceptance: the key is encrypted at rest, never returned, and AAD-bound
 * to its owner. Item (1) — the decrypted key reaching the fake Claude client on a
 * Run — is cross-phase and asserted in Phase 5.
 */
class ApiKeyAcceptanceTest extends IntegrationTest {

    private static final String PLAINTEXT_KEY = "sk-ant-super-secret-abc123";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private EncryptionService encryptionService;

    @Test
    void keyEncryptedAtRestNeverReturnedAndOwnerBound() throws Exception {
        String credentials = "{\"email\":\"acceptance@example.com\",\"password\":\"password123\"}";
        String registerResponse = mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(credentials))
                .andExpect(status().isCreated())
                .andReturn()
                .getResponse()
                .getContentAsString();
        UUID userId = UUID.fromString(JsonPath.read(registerResponse, "$.id"));
        String loginResponse = mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(credentials))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString();
        String token = "Bearer " + JsonPath.<String>read(loginResponse, "$.token");

        // (2) The PUT must not echo the plaintext.
        String putResponse = mockMvc.perform(put("/api/me/api-key")
                        .header(HttpHeaders.AUTHORIZATION, token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"apiKey\":\"" + PLAINTEXT_KEY + "\"}"))
                .andExpect(status().isNoContent())
                .andReturn()
                .getResponse()
                .getContentAsString();
        assertThat(putResponse).doesNotContain(PLAINTEXT_KEY);

        // (2) The GET status must not contain the plaintext.
        String getResponse = mockMvc.perform(get("/api/me/api-key").header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString();
        assertThat(getResponse).doesNotContain(PLAINTEXT_KEY);

        // (3) The stored bytes differ from the plaintext and IV/tag are present.
        Map<String, Object> row =
                jdbcTemplate.queryForMap("select iv, ciphertext, auth_tag from api_key where user_id = ?", userId);
        byte[] iv = (byte[]) row.get("iv");
        byte[] ciphertext = (byte[]) row.get("ciphertext");
        byte[] authTag = (byte[]) row.get("auth_tag");
        assertThat(iv).hasSize(12);
        assertThat(authTag).hasSize(16);
        assertThat(ciphertext).isNotEqualTo(PLAINTEXT_KEY.getBytes(StandardCharsets.UTF_8));

        // The stored ciphertext decrypts back to the plaintext for the owner...
        EncryptedPayload payload = new EncryptedPayload(iv, ciphertext, authTag);
        assertThat(new String(encryptionService.decrypt(payload, userId), StandardCharsets.UTF_8))
                .isEqualTo(PLAINTEXT_KEY);

        // (4) ...but AAD binding means decrypting under another user's UUID fails.
        assertThatThrownBy(() -> encryptionService.decrypt(payload, UUID.randomUUID()))
                .isInstanceOf(IllegalStateException.class);
    }
}
