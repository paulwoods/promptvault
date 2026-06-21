package com.promptvault.error;

/** Thrown on login failure (unknown email or wrong password); yields a generic 401. */
public class InvalidCredentialsException extends RuntimeException {

    public InvalidCredentialsException(String message) {
        super(message);
    }
}
