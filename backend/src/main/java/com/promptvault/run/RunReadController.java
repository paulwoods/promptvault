package com.promptvault.run;

import com.promptvault.security.CurrentUser;
import java.util.List;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
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
    public List<RunSummary> listByPrompt(@PathVariable UUID promptId) {
        return runQueryService.listByPrompt(currentUser.userId(), promptId);
    }

    @GetMapping("/prompts/{promptId}/versions/{number}/runs")
    public List<RunSummary> listByVersion(@PathVariable UUID promptId, @PathVariable int number) {
        return runQueryService.listByVersion(currentUser.userId(), promptId, number);
    }

    @GetMapping("/runs/{runId}")
    public RunDetail getRun(@PathVariable UUID runId) {
        return runQueryService.getRun(currentUser.userId(), runId);
    }
}
