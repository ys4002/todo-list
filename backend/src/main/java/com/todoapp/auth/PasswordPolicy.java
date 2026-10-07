package com.todoapp.auth;

import java.util.Locale;

import org.springframework.stereotype.Component;

import com.todoapp.common.FieldValidationException;

/** Rules that need more than the password itself; shared by register, change and admin reset. */
@Component
public class PasswordPolicy {

    public static final String CONTAINS_USERNAME_MESSAGE = "Password must not contain the username";

    public void checkNotContainsUsername(String field, String password, String username) {
        if (password != null && username != null
                && password.toLowerCase(Locale.ROOT).contains(username.toLowerCase(Locale.ROOT))) {
            throw new FieldValidationException(field, CONTAINS_USERNAME_MESSAGE);
        }
    }
}
