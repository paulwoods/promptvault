package com.promptvault.prompt;

import com.promptvault.security.CurrentUser;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/prompts")
public class PromptController {

    private final PromptService promptService;
    private final CurrentUser currentUser;

    public PromptController(PromptService promptService, CurrentUser currentUser) {
        this.promptService = promptService;
        this.currentUser = currentUser;
    }

    @PostMapping
    public ResponseEntity<VersionResponse> createPrompt(@Valid @RequestBody VersionRequest request) {
        Version version = promptService.createPrompt(currentUser.userId(), request);
        return ResponseEntity.status(HttpStatus.CREATED).body(VersionResponse.from(version));
    }
}
