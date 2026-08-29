package com.promptvault.error;

import java.util.LinkedHashMap;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.resource.NoResourceFoundException;

/**
 * Renders the {@link ApiError} envelope for every failure mode. Framework
 * exceptions are mapped explicitly so Spring's default error JSON never escapes
 * the envelope, and the catch-all returns a generic, non-leaking 500.
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiError> handleValidation(MethodArgumentNotValidException ex) {
        Map<String, String> details = new LinkedHashMap<>();
        for (var fieldError : ex.getBindingResult().getFieldErrors()) {
            details.putIfAbsent(fieldError.getField(), fieldError.getDefaultMessage());
        }
        return ResponseEntity.badRequest().body(new ApiError("validation_error", "Validation failed", details));
    }

    @ExceptionHandler(EmailAlreadyExistsException.class)
    public ResponseEntity<ApiError> handleEmailExists(EmailAlreadyExistsException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(new ApiError("conflict", ex.getMessage(), null));
    }

    @ExceptionHandler(InvalidCredentialsException.class)
    public ResponseEntity<ApiError> handleInvalidCredentials(InvalidCredentialsException ex) {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(new ApiError("unauthorized", ex.getMessage(), null));
    }

    @ExceptionHandler(GoogleNotConfiguredException.class)
    public ResponseEntity<ApiError> handleGoogleNotConfigured(GoogleNotConfiguredException ex) {
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                .body(new ApiError("google_not_configured", ex.getMessage(), null));
    }

    @ExceptionHandler(ResourceNotFoundException.class)
    public ResponseEntity<ApiError> handleNotFound(ResourceNotFoundException ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(new ApiError("not_found", ex.getMessage(), null));
    }

    @ExceptionHandler(DomainValidationException.class)
    public ResponseEntity<ApiError> handleDomainValidation(DomainValidationException ex) {
        return ResponseEntity.badRequest()
                .body(new ApiError("validation_error", "Validation failed", ex.getDetails()));
    }

    @ExceptionHandler(NoApiKeyException.class)
    public ResponseEntity<ApiError> handleNoApiKey(NoApiKeyException ex) {
        return ResponseEntity.badRequest().body(new ApiError("no_api_key", ex.getMessage(), null));
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ApiError> handleUnreadable(HttpMessageNotReadableException ex) {
        return ResponseEntity.badRequest().body(new ApiError("malformed_request", "Malformed request body", null));
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<ApiError> handleConflict(DataIntegrityViolationException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(new ApiError("conflict", "Conflicting request", null));
    }

    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<ApiError> handleNoResource(NoResourceFoundException ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(new ApiError("not_found", "Resource not found", null));
    }

    /**
     * A live path reached by a verb it does not serve — the client error the
     * catch-all would otherwise report as a 500. Reachable since PUT was
     * retired from the Prompt (ADR-0014).
     */
    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    public ResponseEntity<ApiError> handleMethodNotAllowed(HttpRequestMethodNotSupportedException ex) {
        return ResponseEntity.status(HttpStatus.METHOD_NOT_ALLOWED)
                .body(new ApiError("method_not_allowed", "Method not allowed", null));
    }

    /** Catch-all: log the real cause server-side; return a generic body with no internals. */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiError> handleUnexpected(Exception ex) {
        log.error("Unexpected error", ex);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(new ApiError("internal_error", "An unexpected error occurred", null));
    }
}
