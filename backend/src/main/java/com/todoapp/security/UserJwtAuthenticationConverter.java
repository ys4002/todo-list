package com.todoapp.security;

import java.util.List;

import org.springframework.core.convert.converter.Converter;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.CredentialsExpiredException;
import org.springframework.security.authentication.DisabledException;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Component;

import com.todoapp.user.User;
import com.todoapp.user.UserRepository;

/**
 * Builds the authentication from a verified token. The user is loaded from the database on every request, so a
 * disabled or deleted user and a changed password take effect immediately, and the role always comes from the DB.
 */
@Component
public class UserJwtAuthenticationConverter implements Converter<Jwt, AbstractAuthenticationToken> {

    private final UserRepository userRepository;

    public UserJwtAuthenticationConverter(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    @Override
    public AbstractAuthenticationToken convert(Jwt jwt) {
        Long userId = parseUserId(jwt.getSubject());
        User user = userRepository.findById(userId)
                .filter(User::isEnabled)
                .orElseThrow(() -> new DisabledException("Account is disabled"));

        Number tokenVersion = jwt.getClaim("ver");
        if (tokenVersion == null || tokenVersion.intValue() != user.getTokenVersion()) {
            throw new CredentialsExpiredException("Password has been changed. Please log in again.");
        }

        AuthenticatedUser principal = new AuthenticatedUser(user.getId(), user.getUsername(), user.getRole());
        return new UserAuthenticationToken(principal, jwt,
                List.of(new SimpleGrantedAuthority("ROLE_" + user.getRole().name())));
    }

    private Long parseUserId(String subject) {
        try {
            return Long.valueOf(subject);
        } catch (NumberFormatException ex) {
            throw new BadCredentialsException("Invalid token subject");
        }
    }
}
