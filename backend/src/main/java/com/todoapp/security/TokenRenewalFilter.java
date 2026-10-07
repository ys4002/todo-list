package com.todoapp.security;

import java.io.IOException;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Sliding session: adds a fresh token to every response of a request authenticated with a valid token.
 * Runs right after the bearer filter, before the controller, so the header is set whatever the final status.
 */
public class TokenRenewalFilter extends OncePerRequestFilter {

    public static final String TOKEN_HEADER = "X-Auth-Token";
    public static final String EXPIRES_IN_HEADER = "X-Auth-Expires-In";

    private final JwtTokenService jwtTokenService;

    public TokenRenewalFilter(JwtTokenService jwtTokenService) {
        this.jwtTokenService = jwtTokenService;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null
                && authentication.getPrincipal() instanceof AuthenticatedUser user
                && authentication.getCredentials() instanceof Jwt jwt) {
            Number version = jwt.getClaim("ver");
            String token = jwtTokenService.generateToken(user.id(), user.username(), user.role(),
                    version == null ? 0 : version.intValue());
            response.setHeader(TOKEN_HEADER, token);
            response.setHeader(EXPIRES_IN_HEADER, String.valueOf(jwtTokenService.getExpiresInSeconds()));
        }
        chain.doFilter(request, response);
    }
}
