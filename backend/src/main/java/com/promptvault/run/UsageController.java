package com.promptvault.run;

import com.promptvault.security.CurrentUser;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/me/usage")
public class UsageController {

    private static final Logger log = LoggerFactory.getLogger(UsageController.class);

    private final RunQueryService runQueryService;
    private final CurrentUser currentUser;

    public UsageController(RunQueryService runQueryService, CurrentUser currentUser) {
        this.runQueryService = runQueryService;
        this.currentUser = currentUser;
    }

    @GetMapping
    public List<ModelUsage> usage() {
        log.debug("usage(userId={})", currentUser.userId());
        return runQueryService.usage(currentUser.userId());
    }
}
