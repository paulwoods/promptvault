package com.promptvault.apikey;

import com.github.f4b6a3.uuid.UuidCreator;
import com.promptvault.crypto.EncryptedPayload;
import com.promptvault.crypto.EncryptionService;
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
        ApiKey row = apiKeys.findByUserId(userId)
                .map(existing -> {
                    existing.applyPayload(payload);
                    return existing;
                })
                .orElseGet(
                        () -> new ApiKey(UuidCreator.getTimeOrderedEpoch(), userId, payload, CURRENT_ENC_KEY_VERSION));
        apiKeys.save(row);
    }

    @Transactional(readOnly = true)
    public ApiKeyStatus status(UUID userId) {
        return apiKeys.findByUserId(userId)
                .map(key -> new ApiKeyStatus(true, key.getUpdatedAt()))
                .orElseGet(() -> new ApiKeyStatus(false, null));
    }
}
