package com.promptvault.crypto;

import java.nio.ByteBuffer;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.Base64;
import java.util.UUID;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

/**
 * AES-256-GCM encryption keyed from {@code PROMPTVAULT_ENC_KEY}. Each encryption
 * uses a fresh 96-bit IV and a 128-bit auth tag; the AAD is the owning user's
 * UUID, binding each ciphertext to its owner (a copied row fails to decrypt).
 * The key is validated at construction so a missing/malformed key fails fast.
 */
@Service
public class EncryptionService {

    private static final String TRANSFORMATION = "AES/GCM/NoPadding";
    private static final int IV_LENGTH_BYTES = 12;
    private static final int TAG_LENGTH_BITS = 128;
    private static final int TAG_LENGTH_BYTES = TAG_LENGTH_BITS / 8;
    private static final int KEY_LENGTH_BYTES = 32;

    private final SecretKeySpec keySpec;
    private final SecureRandom secureRandom = new SecureRandom();

    public EncryptionService(EncryptionProperties properties) {
        if (!StringUtils.hasText(properties.key())) {
            throw new IllegalStateException("PROMPTVAULT_ENC_KEY must be set");
        }
        byte[] keyBytes;
        try {
            keyBytes = Base64.getDecoder().decode(properties.key().trim());
        } catch (IllegalArgumentException ex) {
            throw new IllegalStateException("PROMPTVAULT_ENC_KEY must be base64-encoded", ex);
        }
        if (keyBytes.length != KEY_LENGTH_BYTES) {
            throw new IllegalStateException("PROMPTVAULT_ENC_KEY must decode to 32 bytes, was " + keyBytes.length);
        }
        this.keySpec = new SecretKeySpec(keyBytes, "AES");
    }

    public EncryptedPayload encrypt(byte[] plaintext, UUID owner) {
        byte[] iv = new byte[IV_LENGTH_BYTES];
        secureRandom.nextBytes(iv);
        try {
            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.ENCRYPT_MODE, keySpec, new GCMParameterSpec(TAG_LENGTH_BITS, iv));
            cipher.updateAAD(toBytes(owner));
            byte[] cipherAndTag = cipher.doFinal(plaintext);
            int ciphertextLength = cipherAndTag.length - TAG_LENGTH_BYTES;
            byte[] ciphertext = Arrays.copyOfRange(cipherAndTag, 0, ciphertextLength);
            byte[] authTag = Arrays.copyOfRange(cipherAndTag, ciphertextLength, cipherAndTag.length);
            return new EncryptedPayload(iv, ciphertext, authTag);
        } catch (GeneralSecurityException ex) {
            throw new IllegalStateException("Encryption failed", ex);
        }
    }

    public byte[] decrypt(EncryptedPayload payload, UUID owner) {
        try {
            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.DECRYPT_MODE, keySpec, new GCMParameterSpec(TAG_LENGTH_BITS, payload.iv()));
            cipher.updateAAD(toBytes(owner));
            byte[] cipherAndTag = new byte[payload.ciphertext().length + payload.authTag().length];
            System.arraycopy(payload.ciphertext(), 0, cipherAndTag, 0, payload.ciphertext().length);
            System.arraycopy(payload.authTag(), 0, cipherAndTag, payload.ciphertext().length, payload.authTag().length);
            return cipher.doFinal(cipherAndTag);
        } catch (GeneralSecurityException ex) {
            // Includes AEADBadTagException when the AAD (owner) or ciphertext does not match.
            throw new IllegalStateException("Decryption failed", ex);
        }
    }

    private static byte[] toBytes(UUID uuid) {
        return ByteBuffer.allocate(16)
                .putLong(uuid.getMostSignificantBits())
                .putLong(uuid.getLeastSignificantBits())
                .array();
    }
}
