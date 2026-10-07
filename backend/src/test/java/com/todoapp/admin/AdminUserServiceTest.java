package com.todoapp.admin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;

import com.todoapp.admin.dto.AdminPasswordResetRequest;
import com.todoapp.auth.PasswordPolicy;
import com.todoapp.common.ConflictException;
import com.todoapp.common.FieldValidationException;
import com.todoapp.common.ResourceNotFoundException;
import com.todoapp.security.JwtTokenService;
import com.todoapp.user.Role;
import com.todoapp.user.User;
import com.todoapp.user.UserRepository;
import com.todoapp.user.UserSummary;

class AdminUserServiceTest {

    private final UserRepository userRepository = mock(UserRepository.class);
    private final PasswordEncoder passwordEncoder = new BCryptPasswordEncoder(4);
    private final JwtTokenService jwtTokenService = mock(JwtTokenService.class);
    private final AdminUserService service =
            new AdminUserService(userRepository, passwordEncoder, new PasswordPolicy(), jwtTokenService);

    private User alice;
    private User admin;

    @BeforeEach
    void setUp() {
        alice = user(2L, "alice_01", Role.USER);
        admin = user(1L, "admin", Role.ADMIN);
        when(userRepository.findById(2L)).thenReturn(Optional.of(alice));
        when(userRepository.findById(1L)).thenReturn(Optional.of(admin));
        when(userRepository.findById(99L)).thenReturn(Optional.empty());
        when(userRepository.findSummaryById(2L)).thenReturn(Optional.of(new UserSummary(alice, 3, 2)));
        when(userRepository.findSummaryById(1L)).thenReturn(Optional.of(new UserSummary(admin, 0, 0)));
        when(jwtTokenService.generateToken(any(User.class))).thenReturn("new-token");
        when(jwtTokenService.getExpiresInSeconds()).thenReturn(3600L);
    }

    private User user(long id, String username, Role role) {
        User user = new User(username, "Name", passwordEncoder.encode("Old#Passw0rd"), role);
        ReflectionTestUtils.setField(user, "id", id);
        return user;
    }

    @Test
    void setEnabledOnSelfIsConflict() {
        assertThatThrownBy(() -> service.setEnabled(1L, 1L, false))
                .isInstanceOf(ConflictException.class).hasMessage("You cannot disable your own account");
        assertThat(admin.isEnabled()).isTrue();
    }

    @Test
    void setEnabledOnUnknownUserIsNotFound() {
        assertThatThrownBy(() -> service.setEnabled(1L, 99L, false))
                .isInstanceOf(ResourceNotFoundException.class).hasMessage("User not found");
    }

    @Test
    void setEnabledUpdatesOtherUser() {
        var response = service.setEnabled(1L, 2L, false);

        assertThat(alice.isEnabled()).isFalse();
        assertThat(response.enabled()).isFalse();
        assertThat(response.taskCount()).isEqualTo(3);
        assertThat(response.openTaskCount()).isEqualTo(2);
        verify(userRepository).saveAndFlush(alice);
    }

    @Test
    void resetPasswordForUnknownUserIsNotFound() {
        assertThatThrownBy(() -> service.resetPassword(1L, 99L, new AdminPasswordResetRequest("N3w#Secret", "N3w#Secret")))
                .isInstanceOf(ResourceNotFoundException.class);
    }

    @Test
    void resetPasswordRejectsPasswordContainingTargetsUsername() {
        assertThatThrownBy(() -> service.resetPassword(1L, 2L, new AdminPasswordResetRequest("xAlice_01!9", "xAlice_01!9")))
                .isInstanceOfSatisfying(FieldValidationException.class, ex -> {
                    assertThat(ex.getFieldErrors().get(0).field()).isEqualTo("newPassword");
                    assertThat(ex.getFieldErrors().get(0).message()).isEqualTo("Password must not contain the username");
                });
        verify(userRepository, never()).saveAndFlush(any());
    }

    @Test
    void resetPasswordOnDisabledUserUpdatesHashBumpsVersionAndKeepsItDisabled() {
        alice.setEnabled(false);

        PasswordResetResult result = service.resetPassword(1L, 2L, new AdminPasswordResetRequest("N3w#Secret", "N3w#Secret"));

        assertThat(passwordEncoder.matches("N3w#Secret", alice.getPasswordHash())).isTrue();
        assertThat(alice.getTokenVersion()).isEqualTo(1);
        assertThat(alice.isEnabled()).isFalse();
        assertThat(result.ownAccount()).isFalse();
        assertThat(result.newToken()).isNull();
    }

    @Test
    void resetOwnPasswordAsksControllerToIssueNewToken() {
        PasswordResetResult result = service.resetPassword(1L, 1L, new AdminPasswordResetRequest("N3w#Secret", "N3w#Secret"));

        assertThat(result.ownAccount()).isTrue();
        assertThat(result.newToken()).isEqualTo("new-token");
        assertThat(result.expiresIn()).isEqualTo(3600);
        assertThat(admin.getTokenVersion()).isEqualTo(1);
    }
}
