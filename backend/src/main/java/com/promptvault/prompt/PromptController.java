package com.promptvault.prompt;

import com.promptvault.common.Page;
import com.promptvault.security.CurrentUser;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
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
    public ResponseEntity<PromptResponse> createPrompt(@RequestBody PromptRequest request) {
        logCreate(request);
        Prompt prompt = promptService.createPrompt(currentUser.userId(), request);
        return ResponseEntity.status(HttpStatus.CREATED).body(PromptResponse.from(prompt));
    }

    /** Partial edit: only the fields present in the body change. Validated once merged, in the service. */
    @PatchMapping("/{promptId}")
    public PromptResponse patchPrompt(@PathVariable UUID promptId, @RequestBody PromptPatchRequest patch) {
        logPatch(promptId, patch);
        return PromptResponse.from(promptService.patchPrompt(currentUser.userId(), promptId, patch));
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

    /** Which fields the patch carries, plus the same shapes and lengths logRequest allows (leak hygiene). */
    private void logPatch(UUID promptId, PromptPatchRequest patch) {
        log.debug(
                "patchPrompt(userId={}, promptId={}, name={}, model={}, maxTokens={}, effort={}, thinking={},"
                        + " promptText.len={}, systemPrompt.len={})",
                currentUser.userId(),
                promptId,
                patch.name(),
                patch.model(),
                patch.maxTokens(),
                patch.effort(),
                patch.thinking(),
                patch.promptText() == null ? "absent" : patch.promptText().length(),
                patch.systemPrompt() == null ? "absent" : patch.systemPrompt().length());
    }

    /** Shapes and lengths only — never the prompt text or system prompt themselves (leak hygiene). */
    private void logCreate(PromptRequest request) {
        log.debug(
                "createPrompt(userId={}, name={}, model={}, maxTokens={}, effort={}, thinking={},"
                        + " promptText.len={}, systemPrompt.len={})",
                currentUser.userId(),
                request.name(),
                request.model(),
                request.maxTokens(),
                request.effort(),
                request.thinking(),
                request.promptText() == null ? 0 : request.promptText().length(),
                request.systemPrompt() == null ? 0 : request.systemPrompt().length());
    }
}
