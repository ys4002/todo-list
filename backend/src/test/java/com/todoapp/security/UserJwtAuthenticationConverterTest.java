package com.todoapp.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.CredentialsExpiredException;
import org.springframework.security.authentication.DisabledException;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.test.util.ReflectionTestUtils;

import com.todoapp.user.Role;
import com.todoapp.user.User;
import com.todoapp.user.UserRepository;

class UserJwtAuthenticationConverterTest {

    private final UserRepository userRepository = mock(UserRepository.class);
    private final UserJwtAuthenticationConverter converter = new UserJwtAuthenticationConverter(userRepository);

    private User user(long id, String username, Role role, boolean enabled, int tokenVersion) {
        User user = new User(username, "Name", "hash", role);
        ReflectionTestUtils.setField(user, "id", id);
        ReflectionTestUtils.setField(user, "tokenVersion", tokenVersion);
        user.setEnabled(enabled);
        return user;
    }

    private Jwt jwt(String subject, int version) {
        return Jwt.withTokenValue("token")
                .header("alg", "HS256")
                .subject(subject)
                .claim("ver", version)
                .claim("role", "ADMIN")
                .issuedAt(Instant.now())
                .expiresAt(Instant.now().plusSeconds(60))
                .build();
    }

    @Test
    void enabledAdminGetsRoleAdminFromDatabase() {
        when(userRepository.findById(1L)).thenReturn(Optional.of(user(1, "admin", Role.ADMIN, true, 0)));

        AbstractAuthenticationToken authentication = converter.convert(jwt("1", 0));

        assertThat(authentication.isAuthenticated()).isTrue();
        assertThat(authentication.getPrincipal()).isEqualTo(new AuthenticatedUser(1L, "admin", Role.ADMIN));
        assertThat(authentication.getAuthorities()).extracting(GrantedAuthority::getAuthority)
                .containsExactly("ROLE_ADMIN");
    }

    @Test
    void enabledUserGetsRoleUserEvenIfTokenClaimsAdmin() {
        when(userRepository.findById(2L)).thenReturn(Optional.of(user(2, "alice_01", Role.USER, true, 0)));

        AbstractAuthenticationToken authentication = converter.convert(jwt("2", 0));

        assertThat(authentication.getAuthorities()).extracting(GrantedAuthority::getAuthority)
                .containsExactly("ROLE_USER");
    }

    @Test
    void disabledUserIsRejected() {
        when(userRepository.findById(3L)).thenReturn(Optional.of(user(3, "bob_02", Role.USER, false, 0)));

        assertThatThrownBy(() -> converter.convert(jwt("3", 0)))
                .isInstanceOf(DisabledException.class)
                .hasMessage("Account is disabled");
    }

    @Test
    void deletedUserIsRejected() {
        when(userRepository.findById(4L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> converter.convert(jwt("4", 0))).isInstanceOf(DisabledException.class);
    }

    @Test
    void staleTokenVersionIsRejected() {
        when(userRepository.findById(5L)).thenReturn(Optional.of(user(5, "carol", Role.USER, true, 1)));

        assertThatThrownBy(() -> converter.convert(jwt("5", 0)))
                .isInstanceOf(CredentialsExpiredException.class)
                .hasMessage("Password has been changed. Please log in again.");
    }

    @Test
    void matchingTokenVersionIsAccepted() {
        when(userRepository.findById(5L)).thenReturn(Optional.of(user(5, "carol", Role.USER, true, 1)));

        assertThat(converter.convert(jwt("5", 1)).isAuthenticated()).isTrue();
    }

    @Test
    void nonNumericSubjectIsRejected() {
        assertThatThrownBy(() -> converter.convert(jwt("abc", 0))).isInstanceOf(BadCredentialsException.class);
    }
}
