package com.promptvault.apikey;

import com.promptvault.crypto.EncryptedPayload;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import org.hibernate.annotations.UpdateTimestamp;

/** A user's Anthropic API key, encrypted at rest (1:1 with the user). */
@Entity
@Table(name = "api_key")
public class ApiKey {

    @Id
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(nullable = false)
    private byte[] iv;

    @Column(nullable = false)
    private byte[] ciphertext;

    @Column(name = "auth_tag", nullable = false)
    private byte[] authTag;

    @Column(name = "enc_key_version", nullable = false)
    private int encKeyVersion;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected ApiKey() {
        // for JPA
    }

    public ApiKey(UUID id, UUID userId, EncryptedPayload payload, int encKeyVersion) {
        this.id = id;
        this.userId = userId;
        this.encKeyVersion = encKeyVersion;
        applyPayload(payload);
    }

    /** Replaces the stored ciphertext (used by the upsert when a key already exists). */
    public void applyPayload(EncryptedPayload payload) {
        this.iv = payload.iv();
        this.ciphertext = payload.ciphertext();
        this.authTag = payload.authTag();
    }

    public EncryptedPayload toPayload() {
        return new EncryptedPayload(iv, ciphertext, authTag);
    }

    public UUID getId() {
        return id;
    }

    public UUID getUserId() {
        return userId;
    }

    public int getEncKeyVersion() {
        return encKeyVersion;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
