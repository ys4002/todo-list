package com.todoapp.auth.dto;

import com.todoapp.auth.validation.PasswordsMatch;
import com.todoapp.auth.validation.StrongPassword;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

@PasswordsMatch(first = "password", second = "confirmPassword")
public record RegisterRequest(
        @NotBlank(message = "Username is required")
        @Pattern(regexp = "^(?:[A-Za-z][A-Za-z0-9._-]{2,29})?$",
                message = "Username must be 3-30 characters, start with a letter, and use only letters, digits, '.', '_' or '-'")
        String username,
        @NotBlank(message = "Name is required")
        @Size(max = 100, message = "Name must be at most 100 characters")
        String name,
        @StrongPassword
        String password,
        String confirmPassword) {

    public RegisterRequest {
        username = username == null ? null : username.trim();
        name = name == null ? null : name.trim();
    }
}
