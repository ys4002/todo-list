package com.todoapp.admin.dto;

import jakarta.validation.constraints.NotNull;

public record UserStatusRequest(@NotNull(message = "Enabled is required") Boolean enabled) {
}
