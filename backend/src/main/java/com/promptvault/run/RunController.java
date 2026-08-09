package com.promptvault.run;

import com.promptvault.security.CurrentUser;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * Running a Prompt is an action, not a resource (ADR-0007): nothing is created,
 * so there is nothing to GET afterwards and no id to hand back.
 */
@RestController
@RequestMapping("/api/prompts/{promptId}/run")
public class RunController {

    private static final Logger log = LoggerFactory.getLogger(RunController.class);

    private final RunService runService;
    private final CurrentUser currentUser;

    public RunController(RunService runService, CurrentUser currentUser) {
        this.runService = runService;
        this.currentUser = currentUser;
    }

    @PostMapping
    public SseEmitter run(@PathVariable UUID promptId, @RequestBody(required = false) RunRequest request) {
        Map<String, String> values = request == null ? Map.of() : request.valuesOrEmpty();
        log.debug("run(userId={}, promptId={}, values.keys={})", currentUser.userId(), promptId, values.keySet());
        return runService.run(currentUser.userId(), promptId, values);
    }
}
