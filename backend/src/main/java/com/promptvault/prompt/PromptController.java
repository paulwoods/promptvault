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
    public ResponseEntity<VersionResponse> createPrompt(@Valid @RequestBody VersionRequest request) {
        log.debug(
                "createPrompt(userId={}, name={}, model={}, maxTokens={}, effort={}, thinking={}, promptText.len={}, systemPrompt.len={}, variables.count={})",
                currentUser.userId(),
                request.name(),
                request.model(),
                request.maxTokens(),
                request.effort(),
                request.thinking(),
                request.promptText() == null ? 0 : request.promptText().length(),
                request.systemPrompt() == null ? 0 : request.systemPrompt().length(),
                request.variables() == null ? 0 : request.variables().size());
        Version version = promptService.createPrompt(currentUser.userId(), request);
        return ResponseEntity.status(HttpStatus.CREATED).body(VersionResponse.from(version));
    }

    @PostMapping("/{promptId}/versions")
    public ResponseEntity<VersionResponse> addVersion(
            @PathVariable UUID promptId, @Valid @RequestBody VersionRequest request) {
        log.debug(
                "addVersion(userId={}, promptId={}, name={}, model={}, maxTokens={}, effort={}, thinking={}, promptText.len={}, systemPrompt.len={}, variables.count={})",
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
        Version version = promptService.addVersion(currentUser.userId(), promptId, request);
        return ResponseEntity.status(HttpStatus.CREATED).body(VersionResponse.from(version));
    }

    @GetMapping
    public Page<PromptSummary> listPrompts(
            @RequestParam(required = false) String q, @RequestParam(required = false) Integer page) {
        log.debug("listPrompts(userId={}, q={}, page={})", currentUser.userId(), q, page);
        return promptService.listPrompts(currentUser.userId(), q, page);
    }

    @GetMapping("/{promptId}")
    public PromptDetail getPrompt(@PathVariable UUID promptId) {
        log.debug("getPrompt(userId={}, promptId={})", currentUser.userId(), promptId);
        return promptService.getPrompt(currentUser.userId(), promptId);
    }

    @GetMapping("/{promptId}/versions/current")
    public VersionResponse getCurrentVersion(@PathVariable UUID promptId) {
        log.debug("getCurrentVersion(userId={}, promptId={})", currentUser.userId(), promptId);
        return VersionResponse.from(promptService.getCurrentVersion(currentUser.userId(), promptId));
    }

    @GetMapping("/{promptId}/versions/{number}")
    public VersionResponse getVersion(@PathVariable UUID promptId, @PathVariable int number) {
        log.debug("getVersion(userId={}, promptId={}, number={})", currentUser.userId(), promptId, number);
        return VersionResponse.from(promptService.getVersion(currentUser.userId(), promptId, number));
    }

    @GetMapping("/trash")
    public List<TrashedPromptSummary> listTrash() {
        log.debug("listTrash(userId={})", currentUser.userId());
        return promptService.listTrash(currentUser.userId());
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
}
