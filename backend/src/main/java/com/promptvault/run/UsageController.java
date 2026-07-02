package com.promptvault.run;

import com.promptvault.security.CurrentUser;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/me/usage")
public class UsageController {

    private final RunQueryService runQueryService;
    private final CurrentUser currentUser;

    public UsageController(RunQueryService runQueryService, CurrentUser currentUser) {
        this.runQueryService = runQueryService;
        this.currentUser = currentUser;
    }

    @GetMapping
    public List<ModelUsage> usage() {
        return runQueryService.usage(currentUser.userId());
    }
}
