package com.todoapp.task;

import java.util.Locale;

import com.todoapp.common.MalformedRequestException;

public enum TaskStatusFilter {
    ALL(null),
    ACTIVE(false),
    COMPLETED(true);

    private final Boolean completed;

    TaskStatusFilter(Boolean completed) {
        this.completed = completed;
    }

    /** Value for the repository's completed filter; null means no filter. */
    public Boolean completedValue() {
        return completed;
    }

    /** Parses the {@code status} query parameter: optional, case-insensitive, default all. */
    public static TaskStatusFilter parse(String value) {
        if (value == null || value.isBlank()) {
            return ALL;
        }
        try {
            return valueOf(value.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException ex) {
            throw new MalformedRequestException("Invalid status: " + value);
        }
    }
}
