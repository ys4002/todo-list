package com.todoapp.auth;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import com.todoapp.auth.dto.RegisterRequest;
import com.todoapp.auth.validation.StrongPassword;
import com.todoapp.auth.validation.StrongPasswordValidator;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;

class ValidatorsTest {

    private static final Validator VALIDATOR = Validation.buildDefaultValidatorFactory().getValidator();
    private final StrongPasswordValidator strongPasswordValidator = new StrongPasswordValidator();

    @Test
    void strongPasswordAccepted() {
        assertThat(strongPasswordValidator.isValid("Str0ng!Pass", null)).isTrue();
        assertThat(strongPasswordValidator.isValid("Str0ng!P" + "a".repeat(56), null)).isTrue();
    }

    @ParameterizedTest
    @ValueSource(strings = { "Sh0rt!", "str0ng!pass", "STR0NG!PASS", "Strong!Pass", "Str0ngPass1", "Str0ng !Pass" })
    void weakPasswordsRejected(String password) {
        assertThat(strongPasswordValidator.isValid(password, null)).isFalse();
    }

    @Test
    void tooLongAndNullRejected() {
        assertThat(strongPasswordValidator.isValid("Str0ng!" + "a".repeat(58), null)).isFalse();
        assertThat(strongPasswordValidator.isValid(null, null)).isFalse();
    }

    @Test
    void weakPasswordMessageIsTheContractMessage() {
        assertThat(StrongPassword.MESSAGE).isEqualTo("Password must be 8-64 characters with no spaces and include an "
                + "upper-case letter, a lower-case letter, a digit and a special character");
    }

    private List<String> messages(String field, RegisterRequest request) {
        return VALIDATOR.validate(request).stream()
                .filter(v -> v.getPropertyPath().toString().equals(field))
                .map(ConstraintViolation::getMessage).toList();
    }

    @Test
    void matchingPasswordsAreValid() {
        RegisterRequest request = new RegisterRequest("alice_01", "Alice", "Str0ng!Pass", "Str0ng!Pass");
        assertThat(VALIDATOR.validate(request)).isEmpty();
    }

    @Test
    void differentConfirmPasswordReportsMismatchOnConfirmField() {
        RegisterRequest request = new RegisterRequest("alice_01", "Alice", "Str0ng!Pass", "Other!Pass1");
        assertThat(messages("confirmPassword", request)).containsExactly("Passwords do not match");
    }

    @Test
    void missingConfirmPasswordIsRequired() {
        RegisterRequest request = new RegisterRequest("alice_01", "Alice", "Str0ng!Pass", null);
        assertThat(messages("confirmPassword", request)).containsExactly("Confirm password is required");
    }

    @Test
    void usernameRule() {
        for (String bad : List.of("ab", "a".repeat(31), "1abc", "bad name", "al!ce")) {
            assertThat(messages("username", new RegisterRequest(bad, "A", "Str0ng!Pass", "Str0ng!Pass")))
                    .as(bad).hasSize(1).first().asString().startsWith("Username must be 3-30");
        }
        assertThat(messages("username", new RegisterRequest("", "A", "Str0ng!Pass", "Str0ng!Pass")))
                .containsExactly("Username is required");
        assertThat(messages("username", new RegisterRequest(" Alice_01 ", "A", "Str0ng!Pass", "Str0ng!Pass"))).isEmpty();
    }

    @Test
    void nameRule() {
        assertThat(messages("name", new RegisterRequest("alice_01", " ", "Str0ng!Pass", "Str0ng!Pass")))
                .containsExactly("Name is required");
        assertThat(messages("name", new RegisterRequest("alice_01", "n".repeat(101), "Str0ng!Pass", "Str0ng!Pass")))
                .containsExactly("Name must be at most 100 characters");
    }
}
