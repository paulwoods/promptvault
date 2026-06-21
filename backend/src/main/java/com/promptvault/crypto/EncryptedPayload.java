package com.promptvault.crypto;

/** An AES-GCM ciphertext split into its stored parts: IV, ciphertext, and auth tag. */
public record EncryptedPayload(byte[] iv, byte[] ciphertext, byte[] authTag) {}
