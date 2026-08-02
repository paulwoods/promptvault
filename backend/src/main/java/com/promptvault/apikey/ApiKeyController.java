package com.promptvault.apikey;

import com.promptvault.security.CurrentUser;
import jakarta.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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

    private static final Logger log = LoggerFactory.getLogger(ApiKeyController.class);

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
        log.debug("setApiKey(userId={}, apiKey=***)", currentUser.userId());
        apiKeyService.save(currentUser.userId(), request.apiKey());
    }

    @GetMapping
    public ApiKeyStatus status() {
        log.debug("status(userId={})", currentUser.userId());
        return apiKeyService.status(currentUser.userId());
    }
}
