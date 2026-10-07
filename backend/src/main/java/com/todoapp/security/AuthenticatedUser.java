package com.todoapp.security;

import com.todoapp.user.Role;

public record AuthenticatedUser(Long id, String username, Role role) {
}
