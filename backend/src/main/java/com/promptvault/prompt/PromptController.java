package com.promptvault.prompt;

import com.promptvault.common.Page;
import com.promptvault.security.CurrentUser;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/prompts")
public class PromptController {

    private static final Logger log = LoggerFactory.getLogger(PromptController.class);

    private final PromptService promptService;
    private final CurrentUser currentUser;

    public PromptController(PromptService promptService, CurrentUser currentUser) {
        this.promptService = promptService;
        this.currentUser = currentUser;
    }

    @PostMapping
    public ResponseEntity<PromptResponse> createPrompt(@Valid @RequestBody PromptRequest request) {
        logRequest("createPrompt", null, request);
        Prompt prompt = promptService.createPrompt(currentUser.userId(), request);
        return ResponseEntity.status(HttpStatus.CREATED).body(PromptResponse.from(prompt));
    }

    @PutMapping("/{promptId}")
    public PromptResponse updatePrompt(@PathVariable UUID promptId, @Valid @RequestBody PromptRequest request) {
        logRequest("updatePrompt", promptId, request);
        return PromptResponse.from(promptService.updatePrompt(currentUser.userId(), promptId, request));
    }

    @GetMapping
    public Page<PromptSummary> listPrompts(
            @RequestParam(required = false) String q, @RequestParam(required = false) Integer page) {
        log.debug("listPrompts(userId={}, q={}, page={})", currentUser.userId(), q, page);
        return promptService.listPrompts(currentUser.userId(), q, page);
    }

    @GetMapping("/trash")
    public List<TrashedPromptSummary> listTrash() {
        log.debug("listTrash(userId={})", currentUser.userId());
        return promptService.listTrash(currentUser.userId());
    }

    @GetMapping("/{promptId}")
    public PromptResponse getPrompt(@PathVariable UUID promptId) {
        log.debug("getPrompt(userId={}, promptId={})", currentUser.userId(), promptId);
        return PromptResponse.from(promptService.getPrompt(currentUser.userId(), promptId));
    }

    @DeleteMapping("/{promptId}")
    public ResponseEntity<Void> deletePrompt(@PathVariable UUID promptId) {
        log.debug("deletePrompt(userId={}, promptId={})", currentUser.userId(), promptId);
        promptService.deletePrompt(currentUser.userId(), promptId);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{promptId}/restore")
    public ResponseEntity<Void> restorePrompt(@PathVariable UUID promptId) {
        log.debug("restorePrompt(userId={}, promptId={})", currentUser.userId(), promptId);
        promptService.restorePrompt(currentUser.userId(), promptId);
        return ResponseEntity.noContent().build();
    }

    /** Shapes and lengths only — never the prompt text or system prompt themselves (leak hygiene). */
    private void logRequest(String operation, UUID promptId, PromptRequest request) {
        log.debug(
                "{}(userId={}, promptId={}, name={}, model={}, maxTokens={}, effort={}, thinking={},"
                        + " promptText.len={}, systemPrompt.len={}, variables.count={})",
                operation,
                currentUser.userId(),
                promptId,
                request.name(),
                request.model(),
                request.maxTokens(),
                request.effort(),
                request.thinking(),
                request.promptText() == null ? 0 : request.promptText().length(),
                request.systemPrompt() == null ? 0 : request.systemPrompt().length(),
                request.variables() == null ? 0 : request.variables().size());
    }
}
