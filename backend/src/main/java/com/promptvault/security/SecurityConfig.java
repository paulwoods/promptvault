package com.promptvault.security;

import com.promptvault.auth.JwtService;
import com.promptvault.error.ApiError;
import jakarta.servlet.DispatcherType;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import tools.jackson.databind.ObjectMapper;

@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Bean
    public SecurityFilterChain securityFilterChain(
            HttpSecurity http, JwtService jwtService, AuthenticationEntryPoint authenticationEntryPoint)
            throws Exception {
        http.csrf(csrf -> csrf.disable())
                .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(
                        // Container-initiated dispatches re-enter this chain carrying no
                        // SecurityContext: JwtAuthenticationFilter is a OncePerRequestFilter, which
                        // skips ASYNC and ERROR dispatches, and STATELESS leaves no session to
                        // restore from. Every SSE run ends in an ASYNC dispatch, so without this
                        // each one is denied — and because the stream already committed the
                        // response, that denial surfaces as a ServletException rather than a 401.
                        // Both are continuations of a request already authorized on its REQUEST
                        // dispatch, and DispatcherType is set by the container, not the client.
                        auth -> auth.dispatcherTypeMatchers(DispatcherType.ASYNC, DispatcherType.ERROR)
                                .permitAll()
                                .requestMatchers(
                                        HttpMethod.POST,
                                        "/api/auth/register",
                                        "/api/auth/login",
                                        "/api/auth/google")
                                .permitAll()
                                // The SPA needs the auth config before it can render a login screen.
                                .requestMatchers(HttpMethod.GET, "/api/hello", "/api/auth/config")
                                .permitAll()
                                .anyRequest()
                                .authenticated())
                .exceptionHandling(ex -> ex.authenticationEntryPoint(authenticationEntryPoint))
                .addFilterBefore(new JwtAuthenticationFilter(jwtService), UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }

    /** Renders the ApiError envelope for unauthenticated requests to protected endpoints. */
    @Bean
    public AuthenticationEntryPoint authenticationEntryPoint(ObjectMapper objectMapper) {
        return (request, response, authException) -> {
            response.setStatus(HttpStatus.UNAUTHORIZED.value());
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            objectMapper.writeValue(
                    response.getWriter(), new ApiError("unauthorized", "Authentication required", null));
        };
    }
}
