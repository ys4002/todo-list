package com.todoapp.admin;

import com.todoapp.admin.dto.AdminUserResponse;

/** {@code newToken} is set only when the admin reset their own password; the controller must send it back. */
public record PasswordResetResult(AdminUserResponse user, String newToken, long expiresIn) {

    public boolean ownAccount() {
        return newToken != null;
    }
}
