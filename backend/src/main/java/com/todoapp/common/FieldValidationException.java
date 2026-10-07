package com.todoapp.common;

import java.util.List;

/** One or more field errors raised by a service; mapped to 400 "Validation failed". */
public class FieldValidationException extends RuntimeException {

    private final List<FieldErrorDetail> fieldErrors;

    public FieldValidationException(List<FieldErrorDetail> fieldErrors) {
        super("Validation failed");
        this.fieldErrors = List.copyOf(fieldErrors);
    }

    public FieldValidationException(String field, String message) {
        this(List.of(new FieldErrorDetail(field, message)));
    }

    public List<FieldErrorDetail> getFieldErrors() {
        return fieldErrors;
    }
}
