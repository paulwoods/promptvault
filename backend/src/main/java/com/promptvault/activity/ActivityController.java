package com.promptvault.activity;

import com.promptvault.common.Page;
import com.promptvault.security.CurrentUser;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/me/activity")
public class ActivityController {

    private static final Logger log = LoggerFactory.getLogger(ActivityController.class);

    private final ActivityQueryService activityQueryService;
    private final CurrentUser currentUser;

    public ActivityController(ActivityQueryService activityQueryService, CurrentUser currentUser) {
        this.activityQueryService = activityQueryService;
        this.currentUser = currentUser;
    }

    @GetMapping
    public Page<ActivityItem> activity(@RequestParam(required = false) Integer page) {
        log.debug("activity(userId={}, page={})", currentUser.userId(), page);
        return activityQueryService.list(currentUser.userId(), page);
    }
}
