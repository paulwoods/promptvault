package com.promptvault.auth;

/**
 * What a verified Google ID token proves. {@code sub} is Google's permanent
 * identifier for the account and the only safe lookup key — {@code email} can
 * change at Google, and is trustworthy as an ownership claim only when
 * {@code emailVerified} is true. {@code name} may be absent.
 */
public record GoogleIdentity(String sub, String email, boolean emailVerified, String name) {}
