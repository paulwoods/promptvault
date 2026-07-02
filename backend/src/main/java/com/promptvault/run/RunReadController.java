package com.promptvault.run;

import com.promptvault.common.Page;
import com.promptvault.security.CurrentUser;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class RunReadController {

    private final RunQueryService runQueryService;
    private final CurrentUser currentUser;

    public RunReadController(RunQueryService runQueryService, CurrentUser currentUser) {
        this.runQueryService = runQueryService;
        this.currentUser = currentUser;
    }

    @GetMapping("/prompts/{promptId}/runs")
    public Page<RunSummary> listByPrompt(
            @PathVariable UUID promptId,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) Integer page) {
        return runQueryService.listByPrompt(currentUser.userId(), promptId, status, page);
    }

    @GetMapping("/prompts/{promptId}/versions/{number}/runs")
    public Page<RunSummary> listByVersion(
            @PathVariable UUID promptId,
            @PathVariable int number,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) Integer page) {
        return runQueryService.listByVersion(currentUser.userId(), promptId, number, status, page);
    }

    @GetMapping("/runs/{runId}")
    public RunDetail getRun(@PathVariable UUID runId) {
        return runQueryService.getRun(currentUser.userId(), runId);
    }
}
