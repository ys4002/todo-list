package com.todoapp.task.dto;

import jakarta.validation.constraints.NotNull;

public record TaskCompletionRequest(@NotNull(message = "Completed is required") Boolean completed) {
}
