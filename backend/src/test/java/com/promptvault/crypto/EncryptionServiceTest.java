package com.promptvault.crypto;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class EncryptionServiceTest {

    private static final String VALID_KEY = Base64.getEncoder().encodeToString(new byte[32]);

    private final EncryptionService service = new EncryptionService(new EncryptionProperties(VALID_KEY));

    @Test
    void roundTripsPlaintext() {
        UUID owner = UUID.randomUUID();
        byte[] plaintext = "sk-ant-secret-key".getBytes(StandardCharsets.UTF_8);

        EncryptedPayload payload = service.encrypt(plaintext, owner);

        assertThat(payload.iv()).hasSize(12);
        assertThat(payload.authTag()).hasSize(16);
        assertThat(payload.ciphertext()).isNotEqualTo(plaintext);
        assertThat(service.decrypt(payload, owner)).isEqualTo(plaintext);
    }

    @Test
    void decryptUnderDifferentOwnerFails() {
        UUID owner = UUID.randomUUID();
        UUID otherOwner = UUID.randomUUID();
        EncryptedPayload payload = service.encrypt("secret".getBytes(StandardCharsets.UTF_8), owner);

        assertThatThrownBy(() -> service.decrypt(payload, otherOwner)).isInstanceOf(IllegalStateException.class);
    }

    @Test
    void freshIvPerEncryption() {
        UUID owner = UUID.randomUUID();
        byte[] plaintext = "secret".getBytes(StandardCharsets.UTF_8);

        assertThat(service.encrypt(plaintext, owner).iv())
                .isNotEqualTo(service.encrypt(plaintext, owner).iv());
    }

    @Test
    void missingKeyFailsFast() {
        assertThatThrownBy(() -> new EncryptionService(new EncryptionProperties(null)))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void malformedKeyFailsFast() {
        assertThatThrownBy(() -> new EncryptionService(new EncryptionProperties("not-base64!!!")))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void wrongLengthKeyFailsFast() {
        String sixteenBytes = Base64.getEncoder().encodeToString(new byte[16]);
        assertThatThrownBy(() -> new EncryptionService(new EncryptionProperties(sixteenBytes)))
                .isInstanceOf(IllegalStateException.class);
    }
}
