package com.todoapp.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

import com.todoapp.common.FieldValidationException;

class PasswordPolicyTest {

    private final PasswordPolicy policy = new PasswordPolicy();

    @Test
    void rejectsPasswordContainingUsernameCaseInsensitively() {
        assertThatThrownBy(() -> policy.checkNotContainsUsername("newPassword", "xALICE_01!9", "alice_01"))
                .isInstanceOfSatisfying(FieldValidationException.class, ex -> {
                    assertThat(ex.getFieldErrors().get(0).field()).isEqualTo("newPassword");
                    assertThat(ex.getFieldErrors().get(0).message()).isEqualTo("Password must not contain the username");
                });
    }

    @Test
    void acceptsPasswordWithoutUsername() {
        assertThatCode(() -> policy.checkNotContainsUsername("newPassword", "N3w#Secret", "alice_01"))
                .doesNotThrowAnyException();
    }
}
