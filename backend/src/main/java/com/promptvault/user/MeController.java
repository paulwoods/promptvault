package com.promptvault.user;

import com.promptvault.security.CurrentUser;
import jakarta.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/me")
public class MeController {

    private static final Logger log = LoggerFactory.getLogger(MeController.class);

    private final UserService userService;
    private final CurrentUser currentUser;

    public MeController(UserService userService, CurrentUser currentUser) {
        this.userService = userService;
        this.currentUser = currentUser;
    }

    @GetMapping
    public MeResponse me() {
        log.debug("me(userId={})", currentUser.userId());
        return userService.me(currentUser.userId());
    }

    @PutMapping("/name")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void setName(@Valid @RequestBody SetNameRequest request) {
        log.debug("setName(userId={}, name={})", currentUser.userId(), request.name());
        userService.updateName(currentUser.userId(), request.name());
    }
}
