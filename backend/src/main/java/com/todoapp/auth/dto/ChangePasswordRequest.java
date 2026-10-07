package com.todoapp.auth.dto;

import com.todoapp.auth.validation.PasswordsMatch;
import com.todoapp.auth.validation.StrongPassword;

import jakarta.validation.constraints.NotBlank;

@PasswordsMatch(first = "newPassword", second = "confirmNewPassword", requiredMessage = "Confirm new password is required")
public record ChangePasswordRequest(
        @NotBlank(message = "Current password is required") String currentPassword,
        @StrongPassword String newPassword,
        String confirmNewPassword) {
}
