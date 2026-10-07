package com.todoapp.auth;

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
import org.mockito.ArgumentCaptor;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;

import com.todoapp.auth.dto.ChangePasswordRequest;
import com.todoapp.auth.dto.LoginRequest;
import com.todoapp.auth.dto.LoginResponse;
import com.todoapp.auth.dto.RegisterRequest;
import com.todoapp.common.AccountDisabledException;
import com.todoapp.common.ConflictException;
import com.todoapp.common.FieldValidationException;
import com.todoapp.common.InvalidCredentialsException;
import com.todoapp.security.JwtTokenService;
import com.todoapp.user.Role;
import com.todoapp.user.User;
import com.todoapp.user.UserRepository;

class AuthServiceTest {

    private final UserRepository userRepository = mock(UserRepository.class);
    private final PasswordEncoder passwordEncoder = new BCryptPasswordEncoder(4);
    private final JwtTokenService jwtTokenService = mock(JwtTokenService.class);
    private final AuthService service = new AuthService(userRepository, passwordEncoder, new PasswordPolicy(), jwtTokenService);

    @BeforeEach
    void setUp() {
        when(userRepository.saveAndFlush(any(User.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(jwtTokenService.getExpiresInSeconds()).thenReturn(3600L);
        when(jwtTokenService.generateToken(any(User.class))).thenReturn("token");
    }

    private User existingUser(boolean enabled, int tokenVersion) {
        User user = new User("alice_01", "Alice", passwordEncoder.encode("Str0ng!Pass"), Role.USER);
        ReflectionTestUtils.setField(user, "id", 2L);
        ReflectionTestUtils.setField(user, "tokenVersion", tokenVersion);
        user.setEnabled(enabled);
        return user;
    }

    @Test
    void registerNormalisesUsernameAndHashesPassword() {
        User saved = service.register(new RegisterRequest(" Alice_01 ", "Alice Smith", "Str0ng!Pass", "Str0ng!Pass"));

        assertThat(saved.getUsername()).isEqualTo("alice_01");
        assertThat(saved.getRole()).isEqualTo(Role.USER);
        assertThat(saved.isEnabled()).isTrue();
        assertThat(saved.getPasswordHash()).startsWith("$2").isNotEqualTo("Str0ng!Pass");
        assertThat(passwordEncoder.matches("Str0ng!Pass", saved.getPasswordHash())).isTrue();
    }

    @Test
    void registerRejectsExistingUsernameIgnoringCase() {
        when(userRepository.existsByUsername("alice_01")).thenReturn(true);

        assertThatThrownBy(() -> service.register(new RegisterRequest("ALICE_01", "Alice", "Str0ng!Pass", "Str0ng!Pass")))
                .isInstanceOf(ConflictException.class).hasMessage("Username is already taken");
        verify(userRepository, never()).saveAndFlush(any());
    }

    @Test
    void registerRejectsPasswordContainingUsername() {
        assertThatThrownBy(() -> service.register(new RegisterRequest("alice_01", "Alice", "Alice_01!x", "Alice_01!x")))
                .isInstanceOfSatisfying(FieldValidationException.class, ex ->
                        assertThat(ex.getFieldErrors().get(0).message()).isEqualTo("Password must not contain the username"));
    }

    @Test
    void loginFailsTheSameWayForWrongPasswordAndUnknownUser() {
        when(userRepository.findByUsername("alice_01")).thenReturn(Optional.of(existingUser(true, 0)));
        when(userRepository.findByUsername("nobody")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.login(new LoginRequest("alice_01", "Wrong!Pass1")))
                .isInstanceOf(InvalidCredentialsException.class).hasMessage("Invalid username or password");
        assertThatThrownBy(() -> service.login(new LoginRequest("nobody", "Str0ng!Pass")))
                .isInstanceOf(InvalidCredentialsException.class).hasMessage("Invalid username or password");
    }

    @Test
    void loginDisabledUserWithCorrectPasswordIsAccountDisabled() {
        when(userRepository.findByUsername("alice_01")).thenReturn(Optional.of(existingUser(false, 0)));

        assertThatThrownBy(() -> service.login(new LoginRequest("alice_01", "Str0ng!Pass")))
                .isInstanceOf(AccountDisabledException.class);
    }

    @Test
    void loginDisabledUserWithWrongPasswordIsInvalidCredentials() {
        when(userRepository.findByUsername("alice_01")).thenReturn(Optional.of(existingUser(false, 0)));

        assertThatThrownBy(() -> service.login(new LoginRequest("alice_01", "Wrong!Pass1")))
                .isInstanceOf(InvalidCredentialsException.class);
    }

    @Test
    void loginSucceedsWithCaseInsensitiveUsername() {
        when(userRepository.findByUsername("alice_01")).thenReturn(Optional.of(existingUser(true, 0)));

        LoginResponse response = service.login(new LoginRequest(" ALICE_01 ", "Str0ng!Pass"));

        assertThat(response.token()).isEqualTo("token");
        assertThat(response.tokenType()).isEqualTo("Bearer");
        assertThat(response.expiresIn()).isEqualTo(3600);
        assertThat(response.user().username()).isEqualTo("alice_01");
    }

    @Test
    void changePasswordWithWrongCurrentPasswordChangesNothing() {
        User user = existingUser(true, 0);
        String hashBefore = user.getPasswordHash();
        when(userRepository.findById(2L)).thenReturn(Optional.of(user));

        assertThatThrownBy(() -> service.changePassword(2L,
                new ChangePasswordRequest("Wrong!Pass1", "N3w#Secret", "N3w#Secret")))
                .isInstanceOfSatisfying(FieldValidationException.class, ex -> {
                    assertThat(ex.getFieldErrors().get(0).field()).isEqualTo("currentPassword");
                    assertThat(ex.getFieldErrors().get(0).message()).isEqualTo("Current password is incorrect");
                });
        assertThat(user.getPasswordHash()).isEqualTo(hashBefore);
        assertThat(user.getTokenVersion()).isZero();
        verify(userRepository, never()).saveAndFlush(any());
    }

    @Test
    void changePasswordRejectsSameAsCurrent() {
        when(userRepository.findById(2L)).thenReturn(Optional.of(existingUser(true, 0)));

        assertThatThrownBy(() -> service.changePassword(2L,
                new ChangePasswordRequest("Str0ng!Pass", "Str0ng!Pass", "Str0ng!Pass")))
                .isInstanceOfSatisfying(FieldValidationException.class, ex -> {
                    assertThat(ex.getFieldErrors().get(0).field()).isEqualTo("newPassword");
                    assertThat(ex.getFieldErrors().get(0).message())
                            .isEqualTo("New password must be different from the current password");
                });
    }

    @Test
    void changePasswordRejectsNewPasswordContainingUsername() {
        when(userRepository.findById(2L)).thenReturn(Optional.of(existingUser(true, 0)));

        assertThatThrownBy(() -> service.changePassword(2L,
                new ChangePasswordRequest("Str0ng!Pass", "xALICE_01!9", "xALICE_01!9")))
                .isInstanceOfSatisfying(FieldValidationException.class, ex ->
                        assertThat(ex.getFieldErrors().get(0).message()).isEqualTo("Password must not contain the username"));
    }

    @Test
    void changePasswordSavesNewHashBumpsVersionAndIssuesTokenForNewVersion() {
        User user = existingUser(true, 0);
        when(userRepository.findById(2L)).thenReturn(Optional.of(user));
        ArgumentCaptor<User> captured = ArgumentCaptor.forClass(User.class);
        when(jwtTokenService.generateToken(captured.capture())).thenReturn("new-token");

        LoginResponse response = service.changePassword(2L, new ChangePasswordRequest("Str0ng!Pass", "N3w#Secret", "N3w#Secret"));

        assertThat(passwordEncoder.matches("N3w#Secret", user.getPasswordHash())).isTrue();
        assertThat(user.getTokenVersion()).isEqualTo(1);
        assertThat(captured.getValue().getTokenVersion()).isEqualTo(1);
        assertThat(response.token()).isEqualTo("new-token");
        verify(userRepository).saveAndFlush(user);
    }
}
