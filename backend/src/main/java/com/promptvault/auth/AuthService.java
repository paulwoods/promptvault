package com.promptvault.auth;

import com.github.f4b6a3.uuid.UuidCreator;
import com.promptvault.activity.ActivityEvent;
import com.promptvault.activity.ActivityRecorder;
import com.promptvault.error.EmailAlreadyExistsException;
import com.promptvault.error.InvalidCredentialsException;
import com.promptvault.user.User;
import com.promptvault.user.UserRepository;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthService {

    private final UserRepository users;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final ActivityRecorder activityRecorder;

    public AuthService(
            UserRepository users,
            PasswordEncoder passwordEncoder,
            JwtService jwtService,
            ActivityRecorder activityRecorder) {
        this.users = users;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.activityRecorder = activityRecorder;
    }

    /** Creates a User with a UUIDv7 id and BCrypt-hashed password. */
    @Transactional
    public User register(String email, String rawPassword) {
        if (users.existsByEmailNormalized(email)) {
            throw new EmailAlreadyExistsException("Email already registered");
        }
        User user = new User(UuidCreator.getTimeOrderedEpoch(), email, email, passwordEncoder.encode(rawPassword));
        users.save(user);
        activityRecorder.record(user.getId(), ActivityEvent.REGISTERED, "Registered");
        return user;
    }

    /**
     * Verifies credentials and returns a signed access token, or throws on
     * failure. A real write now (ADR-0006: login gains its first DB write),
     * so no longer read-only.
     */
    @Transactional
    public String login(String email, String rawPassword) {
        User user = users.findByEmailNormalized(email)
                .filter(u -> passwordEncoder.matches(rawPassword, u.getPasswordHash()))
                .orElseThrow(() -> new InvalidCredentialsException("Invalid email or password"));
        activityRecorder.record(user.getId(), ActivityEvent.LOGGED_IN, "Logged in");
        return jwtService.issue(user);
    }
}
