package com.promptvault.run;

import com.promptvault.common.Page;
import com.promptvault.security.CurrentUser;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class RunReadController {

    private static final Logger log = LoggerFactory.getLogger(RunReadController.class);

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
        log.debug(
                "listByPrompt(userId={}, promptId={}, status={}, page={})",
                currentUser.userId(),
                promptId,
                status,
                page);
        return runQueryService.listByPrompt(currentUser.userId(), promptId, status, page);
    }

    @GetMapping("/prompts/{promptId}/versions/{number}/runs")
    public Page<RunSummary> listByVersion(
            @PathVariable UUID promptId,
            @PathVariable int number,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) Integer page) {
        log.debug(
                "listByVersion(userId={}, promptId={}, number={}, status={}, page={})",
                currentUser.userId(),
                promptId,
                number,
                status,
                page);
        return runQueryService.listByVersion(currentUser.userId(), promptId, number, status, page);
    }

    @GetMapping("/runs/{runId}")
    public RunDetail getRun(@PathVariable UUID runId) {
        log.debug("getRun(userId={}, runId={})", currentUser.userId(), runId);
        return runQueryService.getRun(currentUser.userId(), runId);
    }
}
