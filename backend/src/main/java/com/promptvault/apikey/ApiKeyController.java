package com.promptvault.apikey;

import com.promptvault.security.CurrentUser;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/me/api-key")
public class ApiKeyController {

    private final ApiKeyService apiKeyService;
    private final CurrentUser currentUser;

    public ApiKeyController(ApiKeyService apiKeyService, CurrentUser currentUser) {
        this.apiKeyService = apiKeyService;
        this.currentUser = currentUser;
    }

    /** Upsert the key. Returns 204 with no body — the plaintext is never echoed. */
    @PutMapping
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void setApiKey(@Valid @RequestBody SetApiKeyRequest request) {
        apiKeyService.save(currentUser.userId(), request.apiKey());
    }

    @GetMapping
    public ApiKeyStatus status() {
        return apiKeyService.status(currentUser.userId());
    }
}
