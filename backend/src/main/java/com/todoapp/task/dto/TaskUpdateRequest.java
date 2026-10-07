package com.todoapp.task.dto;

import java.time.Instant;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record TaskUpdateRequest(
        @NotBlank(message = "Title is required")
        @Size(max = 100, message = "Title must be at most 100 characters")
        String title,
        @Size(max = 1000, message = "Description must be at most 1000 characters")
        String description,
        @NotNull(message = "Due date and time is required")
        Instant dueAt,
        @NotNull(message = "Completed is required")
        Boolean completed) {

    public TaskUpdateRequest {
        title = title == null ? null : title.trim();
    }
}
