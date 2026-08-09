package com.promptvault.usage;

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

    private final UsageQueryService usageQueryService;
    private final CurrentUser currentUser;

    public UsageController(UsageQueryService usageQueryService, CurrentUser currentUser) {
        this.usageQueryService = usageQueryService;
        this.currentUser = currentUser;
    }

    @GetMapping
    public List<ModelUsage> usage() {
        log.debug("usage(userId={})", currentUser.userId());
        return usageQueryService.usage(currentUser.userId());
    }
}
