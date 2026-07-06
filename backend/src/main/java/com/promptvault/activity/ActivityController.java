package com.promptvault.activity;

import com.promptvault.common.Page;
import com.promptvault.security.CurrentUser;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/me/activity")
public class ActivityController {

    private final ActivityQueryService activityQueryService;
    private final CurrentUser currentUser;

    public ActivityController(ActivityQueryService activityQueryService, CurrentUser currentUser) {
        this.activityQueryService = activityQueryService;
        this.currentUser = currentUser;
    }

    @GetMapping
    public Page<ActivityItem> activity(@RequestParam(required = false) Integer page) {
        return activityQueryService.list(currentUser.userId(), page);
    }
}
