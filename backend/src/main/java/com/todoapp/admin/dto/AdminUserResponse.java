package com.todoapp.admin.dto;

import java.time.Instant;

import com.todoapp.user.Role;
import com.todoapp.user.User;
import com.todoapp.user.UserSummary;

public record AdminUserResponse(
        Long id,
        String username,
        String name,
        Role role,
        boolean enabled,
        Instant createdAt,
        long taskCount,
        long openTaskCount) {

    public static AdminUserResponse from(UserSummary summary) {
        User user = summary.user();
        return new AdminUserResponse(user.getId(), user.getUsername(), user.getName(), user.getRole(),
                user.isEnabled(), user.getCreatedAt(), summary.taskCount(), summary.openTaskCount());
    }
}
