package com.todoapp.auth.validation;

import java.lang.reflect.Method;

import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;

public class PasswordsMatchValidator implements ConstraintValidator<PasswordsMatch, Object> {

    private String first;
    private String second;
    private String requiredMessage;
    private String mismatchMessage;

    @Override
    public void initialize(PasswordsMatch annotation) {
        this.first = annotation.first();
        this.second = annotation.second();
        this.requiredMessage = annotation.requiredMessage();
        this.mismatchMessage = annotation.message();
    }

    @Override
    public boolean isValid(Object value, ConstraintValidatorContext context) {
        if (value == null) {
            return true;
        }
        Object firstValue = read(value, first);
        Object secondValue = read(value, second);
        if (secondValue == null) {
            return fail(context, requiredMessage);
        }
        if (!secondValue.equals(firstValue)) {
            return fail(context, mismatchMessage);
        }
        return true;
    }

    private boolean fail(ConstraintValidatorContext context, String message) {
        context.disableDefaultConstraintViolation();
        context.buildConstraintViolationWithTemplate(message)
                .addPropertyNode(second)
                .addConstraintViolation();
        return false;
    }

    private Object read(Object target, String property) {
        try {
            Method accessor = target.getClass().getMethod(property);
            return accessor.invoke(target);
        } catch (ReflectiveOperationException ex) {
            throw new IllegalStateException("Cannot read property " + property, ex);
        }
    }
}
