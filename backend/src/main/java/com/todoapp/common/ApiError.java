package com.todoapp.common;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;

import org.springframework.http.HttpStatus;

public record ApiError(
        Instant timestamp,
        int status,
        String error,
        String message,
        String path,
        List<FieldErrorDetail> fieldErrors) {

    public static ApiError of(HttpStatus status, String message, String path, List<FieldErrorDetail> fieldErrors) {
        return new ApiError(
                Instant.now().truncatedTo(ChronoUnit.MILLIS),
                status.value(),
                status.getReasonPhrase(),
                message,
                path,
                fieldErrors == null ? List.of() : fieldErrors);
    }

    public static ApiError of(HttpStatus status, String message, String path) {
        return of(status, message, path, List.of());
    }
}
