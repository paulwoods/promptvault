package com.promptvault.user;

import com.promptvault.activity.ActivityEvent;
import com.promptvault.activity.ActivityRecorder;
import com.promptvault.error.ResourceNotFoundException;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class UserService {

    private final UserRepository users;
    private final ActivityRecorder activityRecorder;

    public UserService(UserRepository users, ActivityRecorder activityRecorder) {
        this.users = users;
        this.activityRecorder = activityRecorder;
    }

    @Transactional(readOnly = true)
    public MeResponse me(UUID userId) {
        User user = require(userId);
        return new MeResponse(user.getId(), user.getEmail(), user.getName());
    }

    /** Trims surrounding whitespace before persisting; uniqueness is not enforced. */
    @Transactional
    public void updateName(UUID userId, String name) {
        String trimmed = name.trim();
        require(userId).setName(trimmed);
        activityRecorder.record(userId, ActivityEvent.NAME_CHANGED, trimmed);
    }

    private User require(UUID userId) {
        return users.findById(userId).orElseThrow(() -> new ResourceNotFoundException("User not found"));
    }
}
