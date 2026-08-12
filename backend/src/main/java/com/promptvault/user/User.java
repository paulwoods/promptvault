package com.promptvault.user;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.UUID;

@Entity
@Table(name = "users")
public class User {

    @Id
    private UUID id;

    @Column(nullable = false)
    private String email;

    @Column(nullable = false)
    private String name;

    /** Null for a User whose only Login Method is Google (ADR-0011). */
    @Column(name = "password_hash")
    private String passwordHash;

    /** Google's permanent subject identifier; null until Google is linked (ADR-0011). */
    @Column(name = "google_sub")
    private String googleSub;

    protected User() {
        // for JPA
    }

    public User(UUID id, String email, String name, String passwordHash) {
        this.id = id;
        this.email = email;
        this.name = name;
        this.passwordHash = passwordHash;
    }

    /** A User provisioned by a first Google sign-in: no password, identified by Google's subject. */
    public static User withGoogleLogin(UUID id, String email, String name, String googleSub) {
        User user = new User(id, email, name, null);
        user.linkGoogle(googleSub);
        return user;
    }

    public UUID getId() {
        return id;
    }

    public String getEmail() {
        return email;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getPasswordHash() {
        return passwordHash;
    }

    public String getGoogleSub() {
        return googleSub;
    }

    /** Adds Google as a Login Method on this User. Linking is one-way — there is no unlink (ADR-0011). */
    public void linkGoogle(String googleSub) {
        this.googleSub = googleSub;
    }
}
