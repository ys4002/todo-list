package com.todoapp.auth;

import java.util.Locale;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.todoapp.auth.dto.ChangePasswordRequest;
import com.todoapp.auth.dto.LoginRequest;
import com.todoapp.auth.dto.LoginResponse;
import com.todoapp.auth.dto.RegisterRequest;
import com.todoapp.auth.dto.UserResponse;
import com.todoapp.common.AccountDisabledException;
import com.todoapp.common.ConflictException;
import com.todoapp.common.FieldValidationException;
import com.todoapp.common.InvalidCredentialsException;
import com.todoapp.common.ResourceNotFoundException;
import com.todoapp.security.JwtTokenService;
import com.todoapp.user.Role;
import com.todoapp.user.User;
import com.todoapp.user.UserRepository;

@Service
public class AuthService {

    static final String USERNAME_TAKEN = "Username is already taken";

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final PasswordPolicy passwordPolicy;
    private final JwtTokenService jwtTokenService;

    public AuthService(UserRepository userRepository, PasswordEncoder passwordEncoder,
            PasswordPolicy passwordPolicy, JwtTokenService jwtTokenService) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.passwordPolicy = passwordPolicy;
        this.jwtTokenService = jwtTokenService;
    }

    @Transactional
    public User register(RegisterRequest request) {
        String username = normalize(request.username());
        passwordPolicy.checkNotContainsUsername("password", request.password(), username);
        if (userRepository.existsByUsername(username)) {
            throw new ConflictException(USERNAME_TAKEN);
        }
        User user = new User(username, request.name().trim(), passwordEncoder.encode(request.password()), Role.USER);
        try {
            return userRepository.saveAndFlush(user);
        } catch (DataIntegrityViolationException ex) {
            throw new ConflictException(USERNAME_TAKEN);
        }
    }

    @Transactional(readOnly = true)
    public LoginResponse login(LoginRequest request) {
        User user = userRepository.findByUsername(normalize(request.username()))
                .orElseThrow(InvalidCredentialsException::new);
        if (!passwordEncoder.matches(request.password(), user.getPasswordHash())) {
            throw new InvalidCredentialsException();
        }
        if (!user.isEnabled()) {
            throw new AccountDisabledException();
        }
        return toLoginResponse(user);
    }

    @Transactional
    public LoginResponse changePassword(Long userId, ChangePasswordRequest request) {
        User user = userRepository.findById(userId).orElseThrow(() -> new ResourceNotFoundException("User not found"));
        if (!passwordEncoder.matches(request.currentPassword(), user.getPasswordHash())) {
            throw new FieldValidationException("currentPassword", "Current password is incorrect");
        }
        if (passwordEncoder.matches(request.newPassword(), user.getPasswordHash())) {
            throw new FieldValidationException("newPassword", "New password must be different from the current password");
        }
        passwordPolicy.checkNotContainsUsername("newPassword", request.newPassword(), user.getUsername());
        user.changePassword(passwordEncoder.encode(request.newPassword()));
        userRepository.saveAndFlush(user);
        return toLoginResponse(user);
    }

    @Transactional(readOnly = true)
    public UserResponse getUser(Long userId) {
        return userRepository.findById(userId).map(UserResponse::from)
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));
    }

    private LoginResponse toLoginResponse(User user) {
        return LoginResponse.bearer(jwtTokenService.generateToken(user), jwtTokenService.getExpiresInSeconds(),
                UserResponse.from(user));
    }

    private String normalize(String username) {
        return username.trim().toLowerCase(Locale.ROOT);
    }
}
