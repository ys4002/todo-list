package com.todoapp.task.dto;

import java.time.Instant;

import com.todoapp.task.Task;

public record TaskResponse(
        Long id,
        String title,
        String description,
        Instant dueAt,
        boolean completed,
        Instant completedAt,
        boolean overdue,
        Instant createdAt,
        Instant updatedAt) {

    public static TaskResponse from(Task task, Instant now) {
        return new TaskResponse(task.getId(), task.getTitle(), task.getDescription(), task.getDueAt(),
                task.isCompleted(), task.getCompletedAt(), task.isOverdue(now), task.getCreatedAt(), task.getUpdatedAt());
    }
}
