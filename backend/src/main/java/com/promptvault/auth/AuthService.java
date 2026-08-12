package com.promptvault.auth;

import com.github.f4b6a3.uuid.UuidCreator;
import com.promptvault.error.EmailAlreadyExistsException;
import com.promptvault.error.InvalidCredentialsException;
import com.promptvault.user.User;
import com.promptvault.user.UserRepository;
import java.util.Optional;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
public class AuthService {

    private final UserRepository users;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final GoogleTokenVerifier googleTokenVerifier;

    public AuthService(
            UserRepository users,
            PasswordEncoder passwordEncoder,
            JwtService jwtService,
            GoogleTokenVerifier googleTokenVerifier) {
        this.users = users;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.googleTokenVerifier = googleTokenVerifier;
    }

    /** Creates a User with a UUIDv7 id and BCrypt-hashed password. */
    @Transactional
    public User register(String email, String rawPassword) {
        if (users.existsByEmailNormalized(email)) {
            throw new EmailAlreadyExistsException("Email already registered");
        }
        User user = new User(UuidCreator.getTimeOrderedEpoch(), email, email, passwordEncoder.encode(rawPassword));
        users.save(user);
        return user;
    }

    /** Verifies credentials and returns a signed access token, or throws on failure. */
    @Transactional(readOnly = true)
    public String login(String email, String rawPassword) {
        User user = users.findByEmailNormalized(email)
                // A Google-only User has no password to match, and gets the same
                // generic failure as a wrong password: the API never discloses
                // which Login Methods an account holds (ADR-0011).
                .filter(u -> u.getPasswordHash() != null)
                .filter(u -> passwordEncoder.matches(rawPassword, u.getPasswordHash()))
                .orElseThrow(() -> new InvalidCredentialsException("Invalid email or password"));
        return jwtService.issue(user);
    }

    /**
     * Verifies a Google ID token and returns an access token for the User it
     * identifies, resolving in the order fixed by ADR-0011: Google's subject
     * first, then a verified email matching an existing User (which links
     * Google onto that User), and only then a newly provisioned User.
     */
    @Transactional
    public String loginWithGoogle(String idToken) {
        GoogleIdentity identity = googleTokenVerifier.verify(idToken);
        // An unverified (or absent) email proves nothing about who owns the
        // mailbox, and linking and provisioning both hinge on it.
        if (!identity.emailVerified() || !StringUtils.hasText(identity.email())) {
            throw new InvalidCredentialsException("Google sign-in failed");
        }

        Optional<User> byGoogleSub = users.findByGoogleSub(identity.sub());
        if (byGoogleSub.isPresent()) {
            return jwtService.issue(byGoogleSub.get());
        }

        Optional<User> byEmail = users.findByEmailNormalized(identity.email());
        if (byEmail.isPresent()) {
            User user = byEmail.get();
            user.linkGoogle(identity.sub());
            users.save(user);
            return jwtService.issue(user);
        }

        // The name claim is optional; seed it with the email, as register does.
        String name = StringUtils.hasText(identity.name()) ? identity.name() : identity.email();
        User user = User.withGoogleLogin(UuidCreator.getTimeOrderedEpoch(), identity.email(), name, identity.sub());
        users.save(user);
        return jwtService.issue(user);
    }
}
