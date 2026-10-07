package com.todoapp.auth.dto;

import java.time.Instant;

import com.todoapp.user.Role;
import com.todoapp.user.User;

public record UserResponse(Long id, String username, String name, Role role, Instant createdAt) {

    public static UserResponse from(User user) {
        return new UserResponse(user.getId(), user.getUsername(), user.getName(), user.getRole(), user.getCreatedAt());
    }
}
