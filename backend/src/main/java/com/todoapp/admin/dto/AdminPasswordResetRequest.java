package com.todoapp.admin.dto;

import com.todoapp.auth.validation.PasswordsMatch;
import com.todoapp.auth.validation.StrongPassword;

@PasswordsMatch(first = "newPassword", second = "confirmNewPassword", requiredMessage = "Confirm new password is required")
public record AdminPasswordResetRequest(
        @StrongPassword String newPassword,
        String confirmNewPassword) {
}
