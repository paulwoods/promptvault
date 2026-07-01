package com.promptvault.apikey;

import com.github.f4b6a3.uuid.UuidCreator;
import com.promptvault.crypto.EncryptedPayload;
import com.promptvault.crypto.EncryptionService;
import com.promptvault.error.NoApiKeyException;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ApiKeyService {

    private static final int CURRENT_ENC_KEY_VERSION = 1;

    private final ApiKeyRepository apiKeys;
    private final EncryptionService encryptionService;

    public ApiKeyService(ApiKeyRepository apiKeys, EncryptionService encryptionService) {
        this.apiKeys = apiKeys;
        this.encryptionService = encryptionService;
    }

    /** Idempotent upsert: stores the first key and replaces an existing one. */
    @Transactional
    public void save(UUID userId, String rawApiKey) {
        String trimmed = rawApiKey.trim();
        EncryptedPayload payload = encryptionService.encrypt(trimmed.getBytes(StandardCharsets.UTF_8), userId);
        String lastSix = trimmed.substring(Math.max(0, trimmed.length() - 6));
        ApiKey row = apiKeys.findByUserId(userId)
                .map(existing -> {
                    existing.applyPayload(payload, lastSix);
                    return existing;
                })
                .orElseGet(() -> new ApiKey(
                        UuidCreator.getTimeOrderedEpoch(), userId, payload, lastSix, CURRENT_ENC_KEY_VERSION));
        apiKeys.save(row);
    }

    /**
     * Returns the decrypted API key for a Run. The no-key guard: if no key is
     * saved this throws {@link NoApiKeyException} before any decryption.
     */
    @Transactional(readOnly = true)
    public String getDecryptedKey(UUID userId) {
        ApiKey key = apiKeys.findByUserId(userId).orElseThrow(() -> new NoApiKeyException("No API key saved"));
        return new String(encryptionService.decrypt(key.toPayload(), userId), StandardCharsets.UTF_8);
    }

    @Transactional(readOnly = true)
    public ApiKeyStatus status(UUID userId) {
        return apiKeys.findByUserId(userId)
                .map(key -> new ApiKeyStatus(true, key.getUpdatedAt(), key.getLastSix()))
                .orElseGet(() -> new ApiKeyStatus(false, null, null));
    }
}
