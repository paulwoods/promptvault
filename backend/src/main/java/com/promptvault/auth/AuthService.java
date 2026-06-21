package com.promptvault.auth;

import com.github.f4b6a3.uuid.UuidCreator;
import com.promptvault.error.EmailAlreadyExistsException;
import com.promptvault.user.User;
import com.promptvault.user.UserRepository;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthService {

    private final UserRepository users;
    private final PasswordEncoder passwordEncoder;

    public AuthService(UserRepository users, PasswordEncoder passwordEncoder) {
        this.users = users;
        this.passwordEncoder = passwordEncoder;
    }

    /** Creates a User with a UUIDv7 id and BCrypt-hashed password. */
    @Transactional
    public User register(String email, String rawPassword) {
        if (users.existsByEmailNormalized(email)) {
            throw new EmailAlreadyExistsException("Email already registered");
        }
        User user = new User(UuidCreator.getTimeOrderedEpoch(), email, passwordEncoder.encode(rawPassword));
        return users.save(user);
    }
}
