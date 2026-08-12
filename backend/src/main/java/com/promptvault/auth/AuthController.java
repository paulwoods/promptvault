package com.promptvault.auth;

import com.promptvault.user.User;
import jakarta.validation.Valid;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private static final Logger log = LoggerFactory.getLogger(AuthController.class);

    private final AuthService authService;
    private final GoogleProperties googleProperties;

    public AuthController(AuthService authService, GoogleProperties googleProperties) {
        this.authService = authService;
        this.googleProperties = googleProperties;
    }

    /** Public: the SPA reads this before login to decide whether to offer Google sign-in. */
    @GetMapping("/config")
    public AuthConfigResponse config() {
        return new AuthConfigResponse(
                StringUtils.hasText(googleProperties.clientId()) ? googleProperties.clientId() : null);
    }

    @PostMapping("/register")
    public ResponseEntity<Map<String, Object>> register(@Valid @RequestBody RegisterRequest request) {
        log.debug("register(email={}, password=***)", request.email());
        User user = authService.register(request.email(), request.password());
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("id", user.getId(), "email", user.getEmail()));
    }

    @PostMapping("/login")
    public Map<String, String> login(@Valid @RequestBody LoginRequest request) {
        log.debug("login(email={}, password=***)", request.email());
        String token = authService.login(request.email(), request.password());
        return Map.of("token", token);
    }

    @PostMapping("/google")
    public Map<String, String> google(@Valid @RequestBody GoogleLoginRequest request) {
        log.debug("google(idToken=***)");
        String token = authService.loginWithGoogle(request.idToken());
        return Map.of("token", token);
    }
}
