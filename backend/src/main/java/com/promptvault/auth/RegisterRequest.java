package com.promptvault.auth;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Registration credentials. Email must be syntactically valid and non-blank;
 * password is 8..72 characters (the upper bound is BCrypt's input limit).
 */
public record RegisterRequest(
        @NotBlank @Email String email,
        @NotBlank @Size(min = 8, max = 72) String password) {}
