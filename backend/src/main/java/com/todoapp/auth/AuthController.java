package com.todoapp.auth;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.todoapp.auth.dto.ChangePasswordRequest;
import com.todoapp.auth.dto.LoginRequest;
import com.todoapp.auth.dto.LoginResponse;
import com.todoapp.auth.dto.RegisterRequest;
import com.todoapp.auth.dto.UserResponse;
import com.todoapp.security.CurrentUserProvider;
import com.todoapp.security.TokenRenewalFilter;

import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;
    private final CurrentUserProvider currentUserProvider;

    public AuthController(AuthService authService, CurrentUserProvider currentUserProvider) {
        this.authService = authService;
        this.currentUserProvider = currentUserProvider;
    }

    @PostMapping("/register")
    @ResponseStatus(HttpStatus.CREATED)
    public UserResponse register(@Valid @RequestBody RegisterRequest request) {
        return UserResponse.from(authService.register(request));
    }

    @PostMapping("/login")
    public LoginResponse login(@Valid @RequestBody LoginRequest request) {
        return authService.login(request);
    }

    @GetMapping("/me")
    public UserResponse me() {
        return authService.getUser(currentUserProvider.getCurrentUser().id());
    }

    @PutMapping("/password")
    public LoginResponse changePassword(@Valid @RequestBody ChangePasswordRequest request, HttpServletResponse response) {
        LoginResponse result = authService.changePassword(currentUserProvider.getCurrentUser().id(), request);
        // The renewal filter already wrote a token with the old version; replace it with the new one.
        response.setHeader(TokenRenewalFilter.TOKEN_HEADER, result.token());
        response.setHeader(TokenRenewalFilter.EXPIRES_IN_HEADER, String.valueOf(result.expiresIn()));
        return result;
    }
}
