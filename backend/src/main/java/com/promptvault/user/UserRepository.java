package com.promptvault.user;

import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface UserRepository extends JpaRepository<User, UUID> {

    @Query("select count(u) > 0 from User u where lower(u.email) = lower(:email)")
    boolean existsByEmailNormalized(@Param("email") String email);

    @Query("select u from User u where lower(u.email) = lower(:email)")
    Optional<User> findByEmailNormalized(@Param("email") String email);

    /** Google's subject is the account-lookup key for Google sign-in (ADR-0011). */
    Optional<User> findByGoogleSub(String googleSub);
}
